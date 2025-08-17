import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const TABLE = process.env.TABLE_NAME!;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async () => {
  let lastEvalKey: any = undefined;
  let total = 0;

  do {
    const q = await doc.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": "RES#UNKNOWN" },
      ExclusiveStartKey: lastEvalKey
    }));

    const items = q.Items ?? [];
    if (items.length) {
      // batch delete (25 max)
      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        await doc.send(new BatchWriteCommand({
          RequestItems: {
            [TABLE]: chunk.map(it => ({ DeleteRequest: { Key: { pk: it.pk, sk: it.sk } } }))
          }
        }));
      }
      total += items.length;
    }

    lastEvalKey = q.LastEvaluatedKey;
  } while (lastEvalKey);

  return { statusCode: 200, body: JSON.stringify({ deleted: total }) };
};
