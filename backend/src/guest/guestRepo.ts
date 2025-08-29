// src/guest/guestRepo.ts
import { ScanCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { doc, TABLE } from "../ingest/db";
import { Guest, guestPk, guestSk, uniq } from "./model";

export async function loadAllGuests(): Promise<Guest[]> {
  let lastKey: any = undefined;
  const out: Guest[] = [];
  do {
    const page = await doc.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: "#e = :g",
      ExpressionAttributeNames: { "#e": "entity" },
      ExpressionAttributeValues: { ":g": "guest" },
      ExclusiveStartKey: lastKey,
    }));
    for (const it of page.Items ?? []) out.push(it as Guest);
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

export async function putNewGuest(g: Guest): Promise<void> {
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: g,
    ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
  }));
}

export async function updateGuestProfile(
  guestId: string,
  patch: Partial<Pick<Guest, "firstName" | "lastName" | "emails" | "phoneNumbers" | "location" | "reservationIds">>
): Promise<void> {
  const sets: string[] = [];
  const names: Record<string,string> = {};
  const values: Record<string,any> = { ":now": new Date().toISOString() };

  const add = (name: string, value: any, attrName?: string) => {
    const n = `#${name}`;
    const v = `:${name}`;
    names[n] = attrName ?? name;
    values[v] = value;
    sets.push(`${n} = ${v}`);
  };

  if (patch.firstName !== undefined) add("firstName", patch.firstName);
  if (patch.lastName !== undefined) add("lastName", patch.lastName);
  if (patch.location !== undefined) add("location", patch.location);
  if (patch.emails) add("emails", uniq(patch.emails));
  if (patch.phoneNumbers) add("phoneNumbers", uniq(patch.phoneNumbers));
  if (patch.reservationIds) add("reservationIds", uniq(patch.reservationIds));

  sets.push("#updatedAt = :now");
  names["#updatedAt"] = "updatedAt";

  await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { pk: guestPk(guestId), sk: guestSk },
    UpdateExpression: `SET ${sets.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

export async function addGuestIdToReservation(propertyId: string, reservationId: string, guestId: string) {
  await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { pk: `RES#${propertyId}`, sk: reservationId },
    UpdateExpression: "SET guestId = :g, updatedAt = :now",
    ExpressionAttributeValues: { ":g": guestId, ":now": new Date().toISOString() },
  }));
}
