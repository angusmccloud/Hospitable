import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { scanAllRows } from "../utils/scanAllRows";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const TABLE = process.env.TABLE_NAME!;

export const handler = async (event: any) => {
  const conversationId = event.pathParameters?.conversationId;
  if (!conversationId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing conversationId" }) };
  }
  console.log('-- Fetching guest by conversationId: --', conversationId);

  // Use scanAllRows utility to find the reservation by conversation_id
  const reservation = await scanAllRows({
    doc,
    params: {
      TableName: TABLE,
      FilterExpression: "#e = :entity AND #cid = :cid",
      ExpressionAttributeNames: { "#e": "entity", "#cid": "conversation_id" },
      ExpressionAttributeValues: { ":entity": "reservation", ":cid": conversationId },
    },
    filter: (r: Record<string, any>) => r.guest && typeof r.guest.id === "string",
    findOne: true,
  }) as Record<string, any> | null;
  console.log('-- Found reservation: --', reservation);
  if (!reservation || !reservation.guest || typeof reservation.guest.id !== "string") {
    return { statusCode: 404, body: JSON.stringify({ error: "No reservation found for conversationId or missing guestId" }) };
  }

  // Fetch guest record by guestId using scanAllRows utility
  const pk = `GUEST#${reservation.guest.id}`;
  const sk = "PROFILE";
  const guest = await scanAllRows({
    doc,
    params: {
      TableName: TABLE,
      FilterExpression: "pk = :pk AND sk = :sk",
      ExpressionAttributeValues: { ":pk": pk, ":sk": sk },
    },
    findOne: true,
  }) as Record<string, any> | null;

  if (!guest) {
    return { statusCode: 404, body: JSON.stringify({ error: "Guest not found" }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify(guest),
  };
};
