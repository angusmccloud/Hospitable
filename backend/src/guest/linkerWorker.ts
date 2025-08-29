// src/guest/linkerWorker.ts
import type { SQSEvent, SQSBatchResponse } from "aws-lambda";
import { linkOrCreateGuestForReservation } from "./linkSimple";
import { ensureGuestReservationIndex } from "../utils/reservationIndex";

type Msg =
  | { type: "reservation"; reservation: any }
  | { type: "backfill-reservation"; reservation: any };

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const failures: { itemIdentifier: string }[] = [];

  for (const rec of event.Records) {
    try {
      const msg: Msg = JSON.parse(rec.body);

      if (msg && (msg.type === "reservation" || msg.type === "backfill-reservation")) {
        const r = msg.reservation;
        if (!r || !r.id || !r.propertyId) {
          console.warn("GuestLinker: skipping record with missing id/propertyId", {
            messageId: rec.messageId,
            hasId: Boolean(r?.id),
            hasPropertyId: Boolean(r?.propertyId),
          });
          continue;
        }

        const guestId = await linkOrCreateGuestForReservation(r);

        // Ensure guest→reservation pointer exists once guestId is known
        await ensureGuestReservationIndex(r, guestId);

        console.log("GuestLinker: linked reservation -> guest", {
          messageId: rec.messageId,
          reservationId: r.id,
          propertyId: r.propertyId,
          guestId,
          source: msg.type,
        });
      } else {
        // Unknown or malformed message — treat as success to avoid poison-pill loops
        console.warn("GuestLinker: unknown message type, ignoring", {
          messageId: rec.messageId,
          body: rec.body?.slice(0, 500),
        });
      }
    } catch (err) {
      console.error("GuestLinker: failed to process message", {
        messageId: rec.messageId,
        err,
      });
      failures.push({ itemIdentifier: rec.messageId });
    }
  }

  return { batchItemFailures: failures };
};
