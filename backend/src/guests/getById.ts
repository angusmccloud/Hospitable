import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { mapGuestItem } from "./mapper";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const TABLE = process.env.TABLE_NAME!;

export const handler = async (event: any) => {
  const guestId = event.pathParameters?.guestId;
  if (!guestId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing guestId" }) };
  }
  const pk = `GUEST#${guestId}`;
  const sk = "PROFILE";
  const out = await doc.send(new GetCommand({
    TableName: TABLE,
    Key: { pk, sk },
  }));
  if (!out.Item) {
    return { statusCode: 404, body: JSON.stringify({ error: "Guest not found" }) };
  }
  
  const guest = mapGuestItem(out.Item);
  
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,OPTIONS,PUT',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(guest),
  };
};
