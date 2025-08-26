// src/ingest/db.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

export const TABLE = process.env.TABLE_NAME || "HospitableData";

export const ddb = new DynamoDBClient({});
export const doc = DynamoDBDocumentClient.from(ddb);

// NOTE: Full replace. Keep this ONLY for entities where clobbering is OK (e.g., properties).
export async function batchPut(items: any[]) {
  if (!items.length) return;
  const chunks: any[][] = [];
  const B = 25;
  for (let i = 0; i < items.length; i += B) chunks.push(items.slice(i, i + B));

  for (const chunk of chunks) {
    await doc.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE]: chunk.map((Item) => ({ PutRequest: { Item } })),
      },
    }));
  }
}

export async function upsertReservations(reservations: any[]) {
  for (const r of reservations) {
    const Key = { pk: r.pk, sk: r.sk };
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};
    const sets: string[] = [];

    // Always bump updatedAt on write
    r.updatedAt = new Date().toISOString();

    for (const [k, v] of Object.entries(r)) {
      if (k === "pk" || k === "sk" || k === "guestId") continue; // never overwrite guestId here
      const nk = `#${k.replace(/[^A-Za-z0-9_]/g, "_")}`;
      const vk = `:${k.replace(/[^A-Za-z0-9_]/g, "_")}`;
      names[nk] = k;
      values[vk] = v;
      sets.push(`${nk} = ${vk}`);
    }

    const UpdateExpression = `SET ${sets.join(", ")}`;

    await doc.send(new UpdateCommand({
      TableName: TABLE,
      Key,
      UpdateExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
  }
}

function buildUpsertExpression(item: Record<string, any>) {
  const names: Record<string, string> = {};
  const values: Record<string, any> = {};

  // timestamps
  const now = new Date().toISOString();
  values[":__createdAt"] = now;
  values[":__updatedAt"] = now;

  const sets: string[] = ["createdAt = if_not_exists(createdAt, :__createdAt)", "updatedAt = :__updatedAt"];

  for (const [k, v] of Object.entries(item)) {
    if (k === "pk" || k === "sk" || k === "createdAt" || k === "updatedAt") continue;
    if (typeof v === "undefined") continue;

    const nameKey = `#${k.replace(/[^A-Za-z0-9]/g, "_")}`;
    const valueKey = `:${k.replace(/[^A-Za-z0-9]/g, "_")}`;

    names[nameKey] = k;
    values[valueKey] = v;
    sets.push(`${nameKey} = ${valueKey}`);
  }

  return {
    UpdateExpression: `SET ${sets.join(", ")}`,
    ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
    ExpressionAttributeValues: values,
  };
}

/** Idempotent upsert for property items (expects items with pk/sk already set).
 *  Never creates duplicate rows; safe to re-run.
 */
export async function upsertProperties(items: Array<Record<string, any>>) {
  for (const raw of items) {
    if (!raw?.pk || !raw?.sk) continue;

    // Build expression from the *raw* item so we upsert all mapped fields
    const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
      buildUpsertExpression(raw);

    await doc.send(new UpdateCommand({
      TableName: TABLE,
      Key: { pk: raw.pk, sk: raw.sk },
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
    }));
  }
}