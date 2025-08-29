import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const TABLE = process.env.TABLE_NAME!;

export const handler = async () => {
  const scan = await doc.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: "#e = :entity",
    ExpressionAttributeNames: { "#e": "entity" },
    ExpressionAttributeValues: { ":entity": "guest" },
  }));

  const guests = (scan.Items ?? []).map(g => ({
    guestId: g.guestId,
    firstName: g.firstName,
    lastName: g.lastName,
    emails: g.emails,
    phoneNumbers: g.phoneNumbers,
    reservationIds: g.reservationIds,
    hostNotes: g.hostNotes,
    location: g.location,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ guests }),
  };
};
