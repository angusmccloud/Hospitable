import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const TABLE = process.env.TABLE_NAME!;

export const handler = async (event: any) => {
  const guestId = event.pathParameters?.guestId;
  if (!guestId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing guestId" }) };
  }
  let hostNotes;
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    hostNotes = body.hostNotes;
    if (typeof hostNotes !== "string") throw new Error();
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid hostNotes payload" }) };
  }

  const pk = `GUEST#${guestId}`;
  const sk = "PROFILE";
  const updatedAt = new Date().toISOString();
  await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { pk, sk },
    UpdateExpression: "set hostNotes = :hostNotes, updatedAt = :updatedAt",
    ExpressionAttributeValues: { ":hostNotes": hostNotes, ":updatedAt": updatedAt },
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ guestId, hostNotes, updatedAt })
  };
};
