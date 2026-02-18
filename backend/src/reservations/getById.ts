import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { getReservationMapper } from "./mapper";

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

  const mapFn = await getReservationMapper(doc, TABLE);
  const reservation = mapFn(item);

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(reservation),
  };
};
