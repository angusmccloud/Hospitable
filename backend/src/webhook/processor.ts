// src/webhook/processor.ts
import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { upsertReservations, batchPut } from "../ingest/db";
import { toReservationItems, toPropertyItems } from "../ingest/mappers";
import { ensureConversationIndex, ensureGuestReservationIndex } from "../utils/reservationIndex";

const sqs = new SQSClient({});
const GUEST_LINK_QUEUE_URL = process.env.GUEST_LINK_QUEUE_URL!;

/** Only process reservation events that carry meaningful data */
const RESERVATION_ALLOWLIST = new Set([
  "reservation.created",
  "reservation.updated",
  "reservation.cancelled",
]);

/** Only process property events that carry meaningful data */
const PROPERTY_ALLOWLIST = new Set([
  "property.created",
  "property.updated",
]);

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const failures: { itemIdentifier: string }[] = [];

  for (const rec of event.Records) {
    try {
      // Receiver enqueues: { headers, body, receivedAt, ... }
      const msg = JSON.parse(rec.body);
      const webhook = msg?.body ?? msg ?? {};
      const action = String(webhook?.action || "");
      const created = webhook?.created;

      // Per docs, payload is inside `data`
      const payload = webhook?.data ?? webhook?.reservation ?? webhook;

      console.log(
        JSON.stringify({
          level: "info",
          msg: "webhook:processor:received",
          action,
          created,
          hasData: Boolean(webhook?.data),
          keys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 10) : [],
        })
      );

      if (RESERVATION_ALLOWLIST.has(action)) {
        const reservationSource = payload;
        if (!reservationSource || typeof reservationSource !== "object") {
          console.warn(
            JSON.stringify({
              level: "warn",
              msg: "webhook:processor:missing_reservation_payload",
              action,
            })
          );
          continue;
        }

        const items = toReservationItems([reservationSource]);
        if (!items.length) {
          console.warn(
            JSON.stringify({
              level: "warn",
              msg: "webhook:processor:toReservationItems_empty",
              action,
            })
          );
          continue;
        }
        const r = items[0];

        // Helpful trace to catch id/pk/sk mismatches quickly
        console.log(
          JSON.stringify({
            level: "debug",
            msg: "webhook:processor:reservation_ids",
            action,
            reservation_id_in_payload: (reservationSource as any)?.id,
            reservation_id_in_item: (r as any)?.id,
            property_id_in_payload:
              (reservationSource as any)?.propertyId ??
              (reservationSource as any)?.properties?.[0]?.id ??
              (reservationSource as any)?.listings?.[0]?.platform_id,
            property_id_in_item: (r as any)?.propertyId,
            conversation_id_from_payload: (reservationSource as any)?.conversation_id,
            conversation_id_from_item: (r as any)?.conversation_id, // mapper may or may not set this
          })
        );

        // Idempotent upsert (preserves existing guestId in upsert)
        await upsertReservations(items);

        // Build pointer indexes (idempotent)
        await ensureConversationIndex(r as any);
        const gid = (r as any)?.guestId as string | undefined;
        if (gid) {
          await ensureGuestReservationIndex(r as any, gid);
        }

        // Only enqueue guest linking for new reservations — updated/cancelled
        // reservations should already have a guest linked.
        if (action === "reservation.created") {
          await sqs.send(
            new SendMessageCommand({
              QueueUrl: GUEST_LINK_QUEUE_URL,
              MessageBody: JSON.stringify({ type: "reservation", reservation: r }),
            })
          );
        }

        console.log(
          JSON.stringify({
            level: "info",
            msg: "webhook:processor:reservation_upserted",
            action,
            reservationId: (r as any)?.id,
            propertyId: (r as any)?.propertyId,
          })
        );
      } else if (PROPERTY_ALLOWLIST.has(action)) {
        const propertySource = (payload as any)?.property ?? payload;
        if (!propertySource || typeof propertySource !== "object") {
          console.warn(
            JSON.stringify({
              level: "warn",
              msg: "webhook:processor:missing_property_payload",
              action,
            })
          );
          continue;
        }

        const props = [
          {
            id: String(propertySource?.id ?? ""),
            name: String(propertySource?.name ?? ""),
          },
        ];

        await batchPut(toPropertyItems(props as any));

        console.log(
          JSON.stringify({
            level: "info",
            msg: "webhook:processor:property_upserted",
            action,
            propertyId: props[0].id,
          })
        );
      } else {
        console.log(
          JSON.stringify({
            level: "info",
            msg: "webhook:processor:skipped_action",
            action,
          })
        );
      }
    } catch (err: any) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "webhook:processor:failed",
          messageId: rec.messageId,
          error: err?.message,
          stack: err?.stack,
        })
      );
      failures.push({ itemIdentifier: rec.messageId });
    }
  }

  return { batchItemFailures: failures };
};
