import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

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
  
  const guest = {
    guestId: out.Item.guestId,
    firstName: out.Item.firstName,
    lastName: out.Item.lastName,
    emails: out.Item.emails,
    phoneNumbers: out.Item.phoneNumbers,
    reservationIds: out.Item.reservationIds,
    hostNotes: out.Item.hostNotes,
    location: out.Item.location,
    createdAt: out.Item.createdAt,
    updatedAt: out.Item.updatedAt,
  };
  
  return {
    statusCode: 200,
    body: JSON.stringify(guest),
  };
};
