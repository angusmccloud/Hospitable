import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { resolveGuestIdFromReservation, linkGuestToReservation } from "./linker";

type Msg =
  | { type: "reservation"; reservation: any } // webhook processor
  | { type: "backfill-reservation"; reservation: any }; // backfill producer

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const failures: { itemIdentifier: string }[] = [];

  for (const rec of event.Records) {
    try {
      const msg: Msg = JSON.parse(rec.body);

      if (msg.type === "reservation" || msg.type === "backfill-reservation") {
        const r = msg.reservation;
        const { guestId } = await resolveGuestIdFromReservation(r);
        await linkGuestToReservation(r, guestId);
      }
      // ignore unknown types for now (idempotent)

    } catch (err) {
      console.error("GuestLinkerWorker failed", { messageId: rec.messageId, err });
      failures.push({ itemIdentifier: rec.messageId });
    }
  }

  return { batchItemFailures: failures };
};
