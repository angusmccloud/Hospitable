// src/api/getByConversationId.ts
import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  BatchGetCommand,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { doc, TABLE } from "../ingest/db";
import { scanAllRows } from "../utils/scanAllRows";

// Constants
const CONV_PREFIX = "CONV#";
const RES_PREFIX = "RES#";
const GUEST_PREFIX = "GUEST#";
const GUEST_PROFILE_SK = "PROFILE";

// Safely pick "best" reservation if not specified
function pickBestReservation(reservations: any[]): any | null {
  if (!reservations?.length) return null;
  // prefer the one with latest last_message_at or arrival_date
  const withKey = (r: any) => ({
    r,
    lastMsg: r.last_message_at ? new Date(r.last_message_at).getTime() : 0,
    arrival: r.arrival_date ? new Date(r.arrival_date).getTime() : 0,
  });
  const ranked = reservations.map(withKey).sort((a, b) => {
    // sort desc by lastMsg, then by arrival
    if (b.lastMsg !== a.lastMsg) return b.lastMsg - a.lastMsg;
    return b.arrival - a.arrival;
  });
  return ranked[0].r;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  // Warmup check - exit immediately to keep container warm
  if ((event as any)?.warmup) {
    return { statusCode: 200, body: JSON.stringify({ warmup: true }) };
  }

  try {
    const conversationId = event?.pathParameters?.conversationId;
    if (!conversationId) {
      return { statusCode: 400, body: JSON.stringify({ error: "conversationId required" }) };
    }

    const qs = event?.queryStringParameters || {};
    const requestedReservationId = qs["reservationId"];

    // 1) Query the conversation index (fast path)
    const convPk = `${CONV_PREFIX}${conversationId}`;
    const conv = await doc.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": convPk },
      ProjectionExpression: "sk, reservationId, propertyId",
    }));

    let convLinks = conv.Items ?? [];

    // Fallback: if no index items exist yet, scan for reservation(s) with that conversation_id (slower)
    if (convLinks.length === 0) {
      const found = await scanAllRows<any>({
        doc,
        params: { TableName: TABLE },
        filter: (row) =>
          row?.entity === "reservation" &&
          row?.conversation_id === conversationId,
      });
      const list = Array.isArray(found) ? found : (found ? [found] : []);
      if (list.length === 0) {
        return { statusCode: 404, body: JSON.stringify({ error: "Reservation not found for conversation" }) };
      }
      // fabricate convLinks in the same shape
      convLinks = list.map((r) => ({
        sk: `RES#${r.id}`,
        reservationId: r.id,
        propertyId: r.propertyId,
      }));
    }

    // Normalize to reservationIds and propertyIds
    const reservationIds = convLinks.map((l: any) => String(l.reservationId ?? (l.sk || "").replace(/^RES#/, ""))).filter(Boolean);
    const propertyIds = convLinks.map((l: any) => String(l.propertyId ?? "")).filter(Boolean);

    if (reservationIds.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: "Reservation not found for conversation" }) };
    }

    // 2) Batch-get reservation items
    const resKeys = reservationIds.map((rid, idx) => ({
      pk: `${RES_PREFIX}${propertyIds[idx] || propertyIds[0] || "UNKNOWN"}`,
      sk: rid,
    }));

    // If some propertyIds didn't come through, do a tiny fallback: try both known propertyIds
    // But usually res writer puts propertyId in the conv index.
    const uniqueKeys = Array.from(
      new Map(resKeys.map((k) => [`${k.pk}#${k.sk}`, k])).values()
    );

    const batchRes = await doc.send(new BatchGetCommand({
      RequestItems: {
        [TABLE]: { Keys: uniqueKeys },
      },
    }));
    const reservations = (batchRes.Responses?.[TABLE] ?? []) as any[];

    if (reservations.length === 0) {
      // Worst-case super fallback: scan for exact reservation id(s)
      const fallback = await scanAllRows<any>({
        doc,
        params: { TableName: TABLE },
        filter: (row) => row?.entity === "reservation" && reservationIds.includes(String(row.id)),
      });
      const list = Array.isArray(fallback) ? fallback : (fallback ? [fallback] : []);
      if (list.length === 0) {
        return { statusCode: 404, body: JSON.stringify({ error: "Reservation not found" }) };
      }
      // continue with scanned list
      reservations.push(...list);
    }

    // 3) Choose the selected reservation
    let selectedReservation: any | null = null;
    if (requestedReservationId) {
      selectedReservation = reservations.find((r) => String(r.id) === String(requestedReservationId)) || null;
    } else if (reservations.length === 1) {
      selectedReservation = reservations[0];
    } else {
      selectedReservation = pickBestReservation(reservations);
    }

    if (!selectedReservation) {
      return { statusCode: 404, body: JSON.stringify({ error: "Reservation not found (selected)" }) };
    }

    const selectedReservationId = String(selectedReservation.id);
    const selectedPropertyId = String(selectedReservation.propertyId ?? "").trim();

    // 4) Load the guest by guestId
    const guestId = selectedReservation.guestId;
    if (!guestId) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          conversationId,
          selectedReservationId,
          selectedPropertyId,
          guest: null,
          reservations: [selectedReservation], // at least return the one we found
        }),
      };
    }

    const guestResp = await doc.send(new GetCommand({
      TableName: TABLE,
      Key: { pk: `${GUEST_PREFIX}${guestId}`, sk: GUEST_PROFILE_SK },
    }));
    const guest = guestResp.Item;
    if (!guest) {
      return { statusCode: 404, body: JSON.stringify({ error: "Guest not found" }) };
    }

    // 5) Batch-get ALL reservations for this guest (guest.reservationIds)
    const guestResIds: string[] = Array.isArray(guest.reservationIds) ? guest.reservationIds : [];
    const guestResKeys = guestResIds
      .map((rid) => {
        // Try to find propertyId in what we already loaded for this conversation
        const match = reservations.find((r) => String(r.id) === String(rid));
        const propId = (match?.propertyId ?? selectedPropertyId) || "UNKNOWN";
        return { pk: `${RES_PREFIX}${propId}`, sk: rid };
      });

    const uniqueGuestResKeys = Array.from(
      new Map(guestResKeys.map((k) => [`${k.pk}#${k.sk}`, k])).values()
    );

    let guestReservations: any[] = [];
    if (uniqueGuestResKeys.length > 0) {
      const batchGuestRes = await doc.send(new BatchGetCommand({
        RequestItems: {
          [TABLE]: { Keys: uniqueGuestResKeys },
        },
      }));
      guestReservations = (batchGuestRes.Responses?.[TABLE] ?? []) as any[];
    }

    // Ensure the selected reservation is included
    const byId = new Map(guestReservations.map((r) => [String(r.id), r]));
    byId.set(String(selectedReservation.id), selectedReservation);
    const allGuestReservations = Array.from(byId.values());

    // 6) Respond with guest + their reservations
    return {
      statusCode: 200,
      body: JSON.stringify({
        conversationId,
        guest,
        reservations: allGuestReservations,
        selectedReservationId,
        selectedPropertyId,
      }),
    };

  } catch (err) {
    console.error("getByConversationId error", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal error" }) };
  }
};
