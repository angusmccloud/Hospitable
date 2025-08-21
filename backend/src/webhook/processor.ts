// src/webhook/processor.ts
import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { batchPut } from "../ingest/db";
import { toReservationItems, toPropertyItems } from "../ingest/mappers";

const sqs = new SQSClient({});
const GUEST_LINK_QUEUE_URL = process.env.GUEST_LINK_QUEUE_URL!;

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const failures: { itemIdentifier: string }[] = [];

  for (const rec of event.Records) {
    try {
      const payload = JSON.parse(rec.body);
      const data = payload.body;
      const action = data?.action as string | undefined;

      if (action?.startsWith("reservation.")) {
        // Upsert reservation
        const rows = Array.isArray(data?.reservations)
          ? data.reservations
          : [data?.reservation ?? data];
        const items = toReservationItems(rows);
        await batchPut(items);

        // Enqueue guest linking (one message per reservation for simplicity)
        for (const r of rows) {
          await sqs.send(new SendMessageCommand({
            QueueUrl: GUEST_LINK_QUEUE_URL,
            MessageBody: JSON.stringify({ type: "reservation", reservation: r }),
          }));
        }
      } else if (action?.startsWith("property.")) {
        const prop = data?.property ?? data;
        await batchPut(toPropertyItems([{ id: String(prop.id), name: String(prop.name ?? "") }]));
      } else {
        // Unknown event type — noop for now
      }
    } catch (err) {
      console.error("WebhookProcessor failure", { messageId: rec.messageId, err });
      failures.push({ itemIdentifier: rec.messageId });
    }
  }

  return { batchItemFailures: failures };
};
