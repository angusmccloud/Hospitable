// src/utils/reservationIndex.ts
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { doc, TABLE } from "../ingest/db";

/**
 * Ensures a pointer item that lets us quickly fetch all reservations for a guest.
 * Safe + idempotent: if guestId is falsy, it no-ops.
 */
export async function ensureGuestReservationIndex(
  reservation: { id: string; propertyId: string },
  guestId?: string | null
) {
  if (!guestId) return; // nothing to do until the reservation is linked

  const resId = String(reservation.id);
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `GUEST#${guestId}`,
        sk: `RES#${resId}`,
        entity: "guest_reservation",
        reservationId: resId,
        propertyId: String(reservation.propertyId),
      },
      ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
    })
  ).catch(() => {
    // idempotent collision, ignore
  });
}

export async function ensureConversationIndex(reservation: any) {
  const conversationId = String(reservation?.conversation_id ?? "").trim();
  const reservationId = String(reservation?.id ?? "").trim();
  const propertyId = String(reservation?.propertyId ?? "").trim();
  if (!conversationId || !reservationId || !propertyId) return;

  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: {
      pk: `CONV#${conversationId}`,
      sk: `RES#${reservationId}`,
      entity: "conv_res_idx",
      reservationId,
      propertyId,
      updatedAt: new Date().toISOString(),
    },
    ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
  })).catch(() => { /* idempotent */ });
}
