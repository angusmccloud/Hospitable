// src/guest/backfill.ts
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { doc, TABLE } from "../ingest/db";
import { normalizeEmail, normalizePhone } from "./model";

const sqs = new SQSClient({});
const GUEST_LINK_QUEUE_URL = process.env.GUEST_LINK_QUEUE_URL!;
const BATCH = 10; // SQS batch max

function groupKey(r: any): string {
  const g = r?.guest ?? {};
  const email = normalizeEmail(g?.email);
  const phones: string[] = (Array.isArray(g?.phone_numbers) ? g.phone_numbers : [])
    .map(normalizePhone)
    .filter(Boolean) as string[];

  // Only group by valid identifiers; never by name/location
  if (email) return `E:${email}`;
  if (phones.length) return `P:${phones[0]}`;

  // fallback: property + reservation id = unique => separate guest per reservation
  return `R:${String(r.propertyId)}#${String(r.id)}`;
}

export const handler = async () => {
  // 1) Scan all reservations
  let lastKey: any = undefined;
  const reservations: any[] = [];

  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "#e = :res AND attribute_not_exists(guestId)",
        ExpressionAttributeNames: { "#e": "entity" },
        ExpressionAttributeValues: { ":res": "reservation" },
        ExclusiveStartKey: lastKey,
      })
    );
    reservations.push(...(page.Items ?? []));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  // 2) Sort by grouping key so repeats sit near each other
  reservations.sort((a, b) => {
    const ka = groupKey(a);
    const kb = groupKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  // 3) Enqueue in small batches
  let enq = 0;
  for (let i = 0; i < reservations.length; i += BATCH) {
    const chunk = reservations.slice(i, i + BATCH);
    await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: GUEST_LINK_QUEUE_URL,
        Entries: chunk.map((r, idx) => ({
          Id: `${i + idx}`,
          MessageBody: JSON.stringify({ type: "backfill-reservation", reservation: r }),
        })),
      })
    );
    enq += chunk.length;
  }

  return { statusCode: 200, body: JSON.stringify({ enqueued: enq }) };
};
