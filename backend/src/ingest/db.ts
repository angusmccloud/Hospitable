import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = new DynamoDBClient({});
export const doc = DynamoDBDocumentClient.from(ddb);
export const TABLE = process.env.TABLE_NAME!;
if (!TABLE) throw new Error("TABLE_NAME not set");

export async function put(item: Record<string, any>) {
  await doc.send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function batchPut(items: Record<string, any>[]) {
  // DynamoDB limit: 25 per batch
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await doc.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE]: chunk.map(Item => ({ PutRequest: { Item } }))
      }
    }));
  }
}
