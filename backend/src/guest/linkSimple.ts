// src/guest/linkSimple.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  TransactWriteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import crypto from "node:crypto";
import { TABLE } from "../ingest/db";

/** ===== Types ===== */
export type GuestId = `${string}-${string}-${string}-${string}-${string}`;

type GuestProfile = {
  pk: string; // GUEST#<id>
  sk: "PROFILE";
  entity: "guest";
  guestId: GuestId;
  firstName: string | null;
  lastName: string | null;
  emails: string[];
  phoneNumbers: string[]; // 10-digit NANP strings
  location: string | null;
  reservationIds: string[];
  hostNotes: string; // editable later
  createdAt: string;
  updatedAt: string;
};

type Reservation = {
  id: string;
  propertyId: string;
  guest?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone_numbers?: (string | null)[];
    location?: string | null;
  };
  // we only rely on id + propertyId + guest block
};

/** ===== DDB setup ===== */
const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);

/** ===== Key helpers ===== */
const guestPk = (id: GuestId) => `GUEST#${id}`;
const guestSk: GuestProfile["sk"] = "PROFILE";

// lightweight identity index items (one row per identity value)
const emailIdxPk = (email: string) => `IDX#EMAIL#${email}`;
const phoneIdxPk = (phone10: string) => `IDX#PHONE#${phone10}`;

/** ===== Normalizers ===== */
function normEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const e = String(raw).trim().toLowerCase();
  // reject placeholders
  if (!e || e.includes("no email alias available")) return null;
  // very light email sanity check (keep it permissive)
  if (!e.includes("@") || !e.includes(".")) return null;
  return e;
}

function normPhoneTo10(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return null;
  // drop leading 1
  const d = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (d.length !== 10) return null;
  return d;
}

/** ===== Candidate builder from reservation ===== */
function candidateFromReservation(r: Reservation) {
  const g = r.guest ?? {};
  const email = normEmail(g.email);
  const phones = Array.from(
    new Set((g.phone_numbers ?? []).map(normPhoneTo10).filter(Boolean) as string[])
  );
  return {
    firstName: g.first_name ?? null,
    lastName: g.last_name ?? null,
    email,
    phoneNumbers: phones,
    location: g.location ?? null,
    reservationId: r.id,
  };
}

/** ===== Guest repo helpers (inline for this file) ===== */
async function getGuest(guestId: GuestId): Promise<GuestProfile | null> {
  const resp = await doc.send(new GetCommand({
    TableName: TABLE,
    Key: { pk: guestPk(guestId), sk: guestSk },
  }));
  return (resp.Item as GuestProfile) ?? null;
}

async function putNewGuest(guest: GuestProfile): Promise<void> {
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: guest,
    ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
  }));
}

async function updateGuestMerge(
  guestId: GuestId,
  fields: Partial<Pick<GuestProfile, "firstName" | "lastName" | "location" | "emails" | "phoneNumbers" | "reservationIds">>
): Promise<void> {
  // Build dynamic merge (append new unique emails/phones/reservations)
  const now = new Date().toISOString();
  const updates: string[] = ["updatedAt = :now"];
  const names: Record<string, string> = {};
  const values: Record<string, any> = { ":now": now };

  if (fields.firstName !== undefined) { updates.push("#fn = if_not_exists(#fn, :fn)"); names["#fn"] = "firstName"; values[":fn"] = fields.firstName; }
  if (fields.lastName !== undefined)  { updates.push("#ln = if_not_exists(#ln, :ln)"); names["#ln"] = "lastName"; values[":ln"] = fields.lastName; }
  if (fields.location !== undefined)  { updates.push("#loc = if_not_exists(#loc, :loc)"); names["#loc"] = "location"; values[":loc"] = fields.location; }

  if (fields.emails?.length) {
    updates.push("#emails = list_append(#emails, :newEmails)");
    names["#emails"] = "emails";
    values[":newEmails"] = fields.emails;
  }
  if (fields.phoneNumbers?.length) {
    updates.push("#phones = list_append(#phones, :newPhones)");
    names["#phones"] = "phoneNumbers";
    values[":newPhones"] = fields.phoneNumbers;
  }
  if (fields.reservationIds?.length) {
    updates.push("#res = list_append(#res, :newRes)");
    names["#res"] = "reservationIds";
    values[":newRes"] = fields.reservationIds;
  }

  const UpdateExpression = "SET " + updates.join(", ");
  await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { pk: guestPk(guestId), sk: guestSk },
    UpdateExpression,
    ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
    ExpressionAttributeValues: values,
  }));

  // Deduplicate arrays (fetch → uniquify → write back) only if we appended
  if ((fields.emails?.length ?? 0) + (fields.phoneNumbers?.length ?? 0) + (fields.reservationIds?.length ?? 0) > 0) {
    const fresh = await getGuest(guestId);
    if (fresh) {
      const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));
      const cleaned: Partial<GuestProfile> = {
        emails: uniq(fresh.emails),
        phoneNumbers: uniq(fresh.phoneNumbers),
        reservationIds: uniq(fresh.reservationIds),
      };
      await doc.send(new UpdateCommand({
        TableName: TABLE,
        Key: { pk: guestPk(guestId), sk: guestSk },
        UpdateExpression: "SET emails = :e, phoneNumbers = :p, reservationIds = :r, updatedAt = :now",
        ExpressionAttributeValues: {
          ":e": cleaned.emails ?? fresh.emails,
          ":p": cleaned.phoneNumbers ?? fresh.phoneNumbers,
          ":r": cleaned.reservationIds ?? fresh.reservationIds,
          ":now": new Date().toISOString(),
        },
      }));
    }
  }
}

/** ===== Identity claiming (email/phone) =====
 * Winner-take-all: first writer creates the idx row; later writers read it and use that guestId.
 */
async function claimIdentityOrReadWinner(
  kind: "email" | "phone",
  value: string,
  candidate: GuestProfile
): Promise<GuestId> {
  const pk = kind === "email" ? emailIdxPk(value) : phoneIdxPk(value);

  // Try to claim by writing the mapping atomically.
  try {
    await doc.send(new PutCommand({
      TableName: TABLE,
      Item: {
        pk,
        sk: "CLAIM",
        entity: "guest_identity",
        guestId: candidate.guestId,
        createdAt: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }));
    // We won the claim — ensure the candidate exists (create if missing).
    const exists = await getGuest(candidate.guestId);
    if (!exists) await putNewGuest(candidate);
    return candidate.guestId as GuestId;
  } catch (e) {
    // Someone else already claimed it; read their guestId.
    const got = await doc.send(new GetCommand({
      TableName: TABLE,
      Key: { pk, sk: "CLAIM" },
      ProjectionExpression: "guestId",
    }));
    const g = (got.Item?.guestId ?? "") as string;
    if (!g) {
      // Very unlikely race: retry by tail recursion once.
      return claimIdentityOrReadWinner(kind, value, candidate);
    }
    return g as GuestId;
  }
}

/** ===== Public: link or create for a reservation (idempotent) ===== */
export async function linkOrCreateGuestForReservation(reservation: Reservation): Promise<GuestId> {
  // Build normalized candidate from reservation
  const ids = candidateFromReservation(reservation);

  // If reservation already has guestId stored, reuse it
  // (We only write back-pointer; we do not rely on reading reservation here,
  // because this worker can be used outside the reservation write path.)

  // Decide initial guestId (new UUID)
  let guestId = crypto.randomUUID() as GuestId;
  const now = new Date().toISOString();

  // Prepare a minimal candidate profile
  const candidate: GuestProfile = {
    pk: guestPk(guestId),
    sk: guestSk,
    entity: "guest",
    guestId,
    firstName: ids.firstName ?? null,
    lastName: ids.lastName ?? null,
    emails: ids.email ? [ids.email] : [],
    phoneNumbers: ids.phoneNumbers,
    location: ids.location ?? null,
    reservationIds: [ids.reservationId],
    hostNotes: "",
    createdAt: now,
    updatedAt: now,
  };

  // If we have a strong identity (email preferred, else first phone), claim or read
  if (ids.email) {
    guestId = await claimIdentityOrReadWinner("email", ids.email, candidate);
  } else if (ids.phoneNumbers.length > 0) {
    guestId = await claimIdentityOrReadWinner("phone", ids.phoneNumbers[0], candidate);
  } else {
    // No identity — create-or-merge by reservation id heuristic:
    // Try to find an existing guest who already has this reservationId (replay-safe).
    // (This is rare in a clean backfill, but helps avoid dupes if reprocessing messages.)
    const maybeExisting = await tryFindGuestByReservationId(ids.reservationId, reservation.propertyId);
    if (maybeExisting) {
      guestId = maybeExisting as GuestId;
    } else {
      // Create a brand new guest with no strong identity
      await putNewGuest(candidate);
    }
  }

  // Merge fields into the winning guest
  await updateGuestMerge(guestId, {
    firstName: ids.firstName ?? undefined,
    lastName: ids.lastName ?? undefined,
    location: ids.location ?? undefined,
    emails: ids.email ? [ids.email] : undefined,
    phoneNumbers: ids.phoneNumbers.length ? ids.phoneNumbers : undefined,
    reservationIds: [ids.reservationId],
  });

  // Write backpointer on the reservation (idempotent)
  try {
    await doc.send(new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `RES#${reservation.propertyId}`, sk: reservation.id },
      UpdateExpression: "SET guestId = if_not_exists(guestId, :g)",
      ExpressionAttributeValues: { ":g": guestId },
    }));
  } catch {
    /* ignore */
  }

  // If we claimed email/phones, ensure index rows exist (idempotent safety)
  // (If claim won earlier, row exists; if not, just a no-op put with condition ignore.)
  if (ids.email) {
    await safeEnsureIdentityRow("email", ids.email, guestId);
  }
  for (const p of ids.phoneNumbers) {
    await safeEnsureIdentityRow("phone", p, guestId);
  }

  return guestId;
}

/** ===== Helpers ===== */
async function tryFindGuestByReservationId(reservationId: string, propertyId: string): Promise<string | null> {
  // Read the reservation from DynamoDB to check if it already has a linked guest
  const resp = await doc.send(new GetCommand({
    TableName: TABLE,
    Key: { pk: `RES#${propertyId}`, sk: reservationId },
    ProjectionExpression: "guestId",
  }));
  return (resp.Item?.guestId as string) ?? null;
}

async function safeEnsureIdentityRow(kind: "email" | "phone", value: string, guestId: GuestId) {
  const pk = kind === "email" ? emailIdxPk(value) : phoneIdxPk(value);
  try {
    await doc.send(new PutCommand({
      TableName: TABLE,
      Item: { pk, sk: "CLAIM", entity: "guest_identity", guestId, createdAt: new Date().toISOString() },
      ConditionExpression: "attribute_not_exists(pk)",
    }));
  } catch {
    /* ignore collisions */
  }
}
