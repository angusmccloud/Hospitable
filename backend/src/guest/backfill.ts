// src/guest/backfill.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { TABLE } from "../ingest/db";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const sqs = new SQSClient({});

const GUEST_LINK_QUEUE_URL = process.env.GUEST_LINK_QUEUE_URL!;
const BATCH_SIZE = 10; // SQS SendMessageBatch max

export const handler = async () => {
  let ExclusiveStartKey: any = undefined;
  let total = 0;

  do {
    const page = await doc.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: "#e = :res",
      ExpressionAttributeNames: { "#e": "entity" },
      ExpressionAttributeValues: { ":res": "reservation" },
      ExclusiveStartKey,
    }));

    const reservations = (page.Items ?? []) as any[];

    for (let i = 0; i < reservations.length; i += BATCH_SIZE) {
      const chunk = reservations.slice(i, i + BATCH_SIZE);
      const Entries = chunk.map((r, idx) => ({
        Id: String(idx),
        MessageBody: JSON.stringify({ type: "backfill-reservation", reservation: r }),
      }));

      await sqs.send(new SendMessageBatchCommand({
        QueueUrl: GUEST_LINK_QUEUE_URL,
        Entries,
      }));

      total += chunk.length;
    }

    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return { statusCode: 200, body: JSON.stringify({ enqueued: total }) };
};
