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
    ExpressionAttributeValues: { ":entity": "reservation" },
  }));

  const reservations = (scan.Items ?? []).map(r => ({
    reservationId: r.id,
    propertyId: r.propertyId,
    guestId: r.guestId ?? r.guest?.id,
    arrivalDate: r.arrivalDate ?? r.arrival_date,
    departureDate: r.departureDate ?? r.departure_date,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    // Add other relevant fields as needed
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ reservations }),
  };
};
