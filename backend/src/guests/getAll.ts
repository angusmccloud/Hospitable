import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { scanAllRows } from "../utils/scanAllRows";
import { mapGuestItem } from "./mapper";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const TABLE = process.env.TABLE_NAME!;

export const handler = async () => {
  const raw = await scanAllRows<any>({
    doc,
    params: {
      TableName: TABLE,
      FilterExpression: "#e = :entity",
      ExpressionAttributeNames: { "#e": "entity" },
      ExpressionAttributeValues: { ":entity": "guest" },
    },
  });

  const items = Array.isArray(raw) ? raw : [];

  const guests = items.map(mapGuestItem);

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ guests }),
  };
};
