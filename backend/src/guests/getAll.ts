import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const TABLE = process.env.TABLE_NAME!;

export const handler = async () => {
  const scan = await doc.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: "#e = :entity and reservationCount > :min",
    ExpressionAttributeNames: { "#e": "entity" },
    ExpressionAttributeValues: { ":entity": "guest_profile", ":min": 0 },
  }));

  const guests = (scan.Items ?? []).map(g => ({
    guestId: g.guestId,
    firstName: g.firstName,
    lastName: g.lastName,
    email: g.email,
    phones: g.phones,
    reservationCount: g.reservationCount,
    reservationIds: g.reservationIds,
    lastReservationAt: g.lastReservationAt,
    updatedAt: g.updatedAt,
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ guests }),
  };
};
