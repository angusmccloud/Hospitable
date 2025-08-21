import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
  UpdateCommand,
  QueryCommand,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import crypto from "node:crypto";
import { TABLE } from "../ingest/db";

const ddb = new DynamoDBClient({});
export const doc = DynamoDBDocumentClient.from(ddb);

// ---------- Key helpers ----------
const guestPk = (guestId: string) => `GUEST#${guestId}`;
const guestProfileSk = () => "PROFILE";
const guestArrEdgeSk = (arrivalISO: string, resId: string) => `ARR#${arrivalISO}#RES#${resId}`;
const emailPk = (email: string) => `EMAIL#${email.toLowerCase()}`;
const emailSk = (guestId: string) => `GUEST#${guestId}`;
const phonePk = (phone: string) => `PHONE#${phone}`;
const phoneSk = (guestId: string) => `GUEST#${guestId}`;

const normalizePhone = (p?: string | null) => {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  // strip leading US "1"
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
};

const bestArrivalISO = (r: any) =>
  String(r?.arrival_date ?? r?.check_in ?? r?.booking_date ?? new Date().toISOString());

// ---------- Guest resolution (find or create) ----------
export async function resolveGuestIdFromReservation(reservation: any): Promise<{
  guestId: string;
  email: string | null;
  phones: string[];
  firstName: string | null;
  lastName: string | null;
}> {
  const guest = reservation?.guest ?? {};
  const email = (guest?.email ? String(guest.email).toLowerCase() : null);
  const rawPhones: (string | null)[] = Array.isArray(guest?.phone_numbers) ? guest.phone_numbers : [];
  const phones = Array.from(
    new Set(rawPhones.map(normalizePhone).filter(Boolean) as string[])
  );

  // 1) Try email match
  if (email) {
    const q = await doc.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": emailPk(email) },
      Limit: 1,
      ProjectionExpression: "sk",
    }));
    const hit = q.Items?.[0]?.sk as string | undefined; // "GUEST#<id>"
    if (hit?.startsWith("GUEST#")) {
      const guestId = hit.slice("GUEST#".length);
      return {
        guestId,
        email,
        phones,
        firstName: guest?.first_name ?? null,
        lastName: guest?.last_name ?? null,
      };
    }
  }

  // 2) Try phone match
  for (const ph of phones) {
    const q = await doc.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": phonePk(ph) },
      Limit: 1,
      ProjectionExpression: "sk",
    }));
    const hit = q.Items?.[0]?.sk as string | undefined;
    if (hit?.startsWith("GUEST#")) {
      const guestId = hit.slice("GUEST#".length);
      return {
        guestId,
        email,
        phones,
        firstName: guest?.first_name ?? null,
        lastName: guest?.last_name ?? null,
      };
    }
  }

  // 3) Create a new guest (profile + email/phone index records)
  const guestId = crypto.randomUUID();
  const now = new Date().toISOString();

  const txItems: any[] = [
    {
      Put: {
        TableName: TABLE,
        Item: {
          pk: guestPk(guestId),
          sk: guestProfileSk(),
          entity: "guest_profile",
          guestId,
          firstName: guest?.first_name ?? null,
          lastName: guest?.last_name ?? null,
          email: email ?? null,
          phones,
          reservationIds: [],          // String Set will be created on first link
          reservationCount: 0,
          createdAt: now,
          updatedAt: now,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      },
    },
  ];

  if (email) {
    txItems.push({
      Put: {
        TableName: TABLE,
        Item: { pk: emailPk(email), sk: emailSk(guestId), entity: "guest_email" },
        ConditionExpression: "attribute_not_exists(pk)",
      },
    });
  }

  for (const ph of phones) {
    txItems.push({
      Put: {
        TableName: TABLE,
        Item: { pk: phonePk(ph), sk: phoneSk(guestId), entity: "guest_phone" },
        ConditionExpression: "attribute_not_exists(pk)",
      },
    });
  }

  await doc.send(new TransactWriteCommand({ TransactItems: txItems })).catch(async (e) => {
    // If a race happened (ConditionCheckFailed), try to re-resolve once via email/phone
    if (String(e).includes("ConditionalCheckFailed")) {
      if (email) {
        const q = await doc.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "pk = :p",
          ExpressionAttributeValues: { ":p": emailPk(email) },
          Limit: 1,
          ProjectionExpression: "sk",
        }));
        const hit = q.Items?.[0]?.sk as string | undefined;
        if (hit?.startsWith("GUEST#")) {
          return;
        }
      }
      for (const ph of phones) {
        const q = await doc.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "pk = :p",
          ExpressionAttributeValues: { ":p": phonePk(ph) },
          Limit: 1,
          ProjectionExpression: "sk",
        }));
        const hit = q.Items?.[0]?.sk as string | undefined;
        if (hit?.startsWith("GUEST#")) {
          return;
        }
      }
    }
    throw e;
  });

  return { guestId, email, phones, firstName: guest?.first_name ?? null, lastName: guest?.last_name ?? null };
}

// ---------- Link reservation to guest ----------
export async function linkGuestToReservation(reservation: any, guestId: string) {
  const pk = guestPk(guestId);
  const resId = String(reservation.id);
  const arrivalISO = bestArrivalISO(reservation);

  // Edge (ordered history) — idempotent
  await doc.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE,
          Item: {
            pk,
            sk: guestArrEdgeSk(arrivalISO.slice(0, 10), resId),
            entity: "guest_res_edge",
            reservationId: resId,
            arrival_date: arrivalISO,
          },
          ConditionExpression: "attribute_not_exists(pk)",
        },
      },
    ],
  })).catch(() => { /* ignore idempotent collision */ });

  // Add resId into string set and update lastReservationAt
  const addResp = await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { pk, sk: guestProfileSk() },
    UpdateExpression: `
      ADD reservationIds :r
      SET lastReservationAt = :arr, updatedAt = :now
    `,
    ExpressionAttributeValues: {
      ":r": (doc as any).createSet ? (doc as any).createSet([resId]) : (new Set([resId]) as any),
      ":arr": arrivalISO,
      ":now": new Date().toISOString(),
    },
    ReturnValues: "ALL_NEW",
  }));

  // Keep an exact count (size of set)
  const setVal = addResp.Attributes?.reservationIds as unknown;
  const count = Array.isArray(setVal)
    ? setVal.length
    : setVal instanceof Set
      ? (setVal as Set<string>).size
      : (Array.isArray((setVal as any)?.values) ? (setVal as any).values.length : 0);

  await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { pk, sk: guestProfileSk() },
    UpdateExpression: "SET reservationCount = :c, updatedAt = :now",
    ExpressionAttributeValues: { ":c": count, ":now": new Date().toISOString() },
  }));

  // Merge light contact fields when missing
  await mergeContact(pk, {
    email: reservation?.guest?.email ?? null,
    phones: (reservation?.guest?.phone_numbers ?? [])
      .map(normalizePhone)
      .filter(Boolean) as string[],
    firstName: reservation?.guest?.first_name ?? null,
    lastName: reservation?.guest?.last_name ?? null,
  });
}

async function mergeContact(
  pk: string,
  opts: { email?: string | null; phones?: string[]; firstName?: string | null; lastName?: string | null }
) {
  const current = await doc.send(new GetCommand({
    TableName: TABLE,
    Key: { pk, sk: guestProfileSk() },
    ProjectionExpression: "email, phones, firstName, lastName",
  }));
  const existing = current.Item ?? {};

  const nextEmail = existing.email ?? opts.email ?? null;
  const nextFirst = existing.firstName ?? opts.firstName ?? null;
  const nextLast = existing.lastName ?? opts.lastName ?? null;

  const curPhones: string[] = Array.isArray(existing.phones) ? existing.phones : [];
  const inc = (opts.phones ?? []).filter(Boolean) as string[];
  const mergedPhones = Array.from(new Set([...curPhones, ...inc]));

  await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { pk, sk: guestProfileSk() },
    UpdateExpression: `
      SET email = :e, phones = :ph, firstName = :fn, lastName = :ln, updatedAt = :now
    `,
    ExpressionAttributeValues: {
      ":e": nextEmail,
      ":ph": mergedPhones,
      ":fn": nextFirst,
      ":ln": nextLast,
      ":now": new Date().toISOString(),
    },
  }));
}
