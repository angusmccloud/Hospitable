// src/webhook/processor.ts
import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { upsertReservations, batchPut } from "../ingest/db";
import { toReservationItems, toPropertyItems } from "../ingest/mappers";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { ensureConversationIndex, ensureGuestReservationIndex } from "../utils/reservationIndex";

const sqs = new SQSClient({});
const GUEST_LINK_QUEUE_URL = process.env.GUEST_LINK_QUEUE_URL!;

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const failures: { itemIdentifier: string }[] = [];

  for (const rec of event.Records) {
    try {
      const payload = JSON.parse(rec.body);
      const data = payload.body;
      const action = data?.action as string | undefined;

      console.log("WebhookProcessor: action =", action);

      if (action?.startsWith("reservation.")) {
        const resObj = data?.reservation ?? data;
        const items = toReservationItems([resObj]);
        const r = items[0];

        // SAFE write that preserves any existing guestId
        await upsertReservations(items);

        // Build pointer indexes *now* so API reads are fast, even before guest linking
        await ensureConversationIndex(r);
        const gid = (r as any).guestId as string | undefined;
        if (gid) {
          await ensureGuestReservationIndex(r, gid);
        }

        // Enqueue for guest linking (idempotent)
        await sqs.send(new SendMessageCommand({
          QueueUrl: GUEST_LINK_QUEUE_URL,
          MessageBody: JSON.stringify({ type: "reservation", reservation: r }),
        }));

      } else if (action?.startsWith("property.")) {
        const props = [{
          id: String(data?.property?.id ?? data?.id),
          name: String(data?.property?.name ?? data?.name ?? "")
        }];
        await batchPut(toPropertyItems(props as any));

      } else {
        console.log("WebhookProcessor: unhandled action, skipping");
      }

    } catch (err) {
      console.error("WebhookProcessor failed", { messageId: rec.messageId, err });
      failures.push({ itemIdentifier: rec.messageId });
    }
  }

  return { batchItemFailures: failures };
};
