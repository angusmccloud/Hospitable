import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const TABLE = process.env.TABLE_NAME!;

export const handler = async (event: any) => {
  const reservationId = event.pathParameters?.reservationId;
  if (!reservationId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing reservationId" }) };
  }

  // Scan for reservation with matching id
  const scan = await doc.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: "#e = :entity AND #id = :id",
    ExpressionAttributeNames: { "#e": "entity", "#id": "id" },
    ExpressionAttributeValues: { ":entity": "reservation", ":id": reservationId },
  }));

  const item = (scan.Items ?? [])[0];
  if (!item) {
    return { statusCode: 404, body: JSON.stringify({ error: "Reservation not found" }) };
  }

  const reservation = {
    reservationId: item.id,
    propertyId: item.propertyId,
    guestId: item.guestId ?? item.guest?.id,
    arrivalDate: item.arrivalDate ?? item.arrival_date,
    departureDate: item.departureDate ?? item.departure_date,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    // Add other relevant fields as needed
  };

  return {
    statusCode: 200,
    body: JSON.stringify(reservation),
  };
};
