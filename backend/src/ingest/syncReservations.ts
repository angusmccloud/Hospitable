// src/ingest/syncReservations.ts
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { doc, TABLE, upsertReservations } from "./db";
import { fetchReservationsPaged } from "./hospitableClient";
import { toReservationItems } from "./mappers";
import { ensureConversationIndex, ensureGuestReservationIndex } from "../utils/reservationIndex";

type EventBody = {
  propertyIds?: string[];
  startDate?: string; // 'YYYY-MM-DD' | 'LAST_30_DAYS'
  endDate?: string;   // 'YYYY-MM-DD' | 'PLUS_2_YEARS'
  include?: string[];
  perPage?: number;
};

const toISO = (d: Date) => d.toISOString().slice(0, 10);

function resolveStart(input?: string): string {
  if (input === "LAST_30_DAYS") {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toISO(d);
  }
  return (input ?? "2010-01-01").slice(0, 10);
}

function resolveEnd(input?: string): string {
  const today = new Date();
  const plus2Years = new Date(today);
  plus2Years.setFullYear(today.getFullYear() + 2);
  const end = input === "PLUS_2_YEARS" || !input ? plus2Years : new Date(input);
  return toISO(end > plus2Years ? plus2Years : end);
}

// Load property IDs from DynamoDB (pk = "PROP", sk = <propertyId>)
async function loadPropertyIdsFromDb(): Promise<string[]> {
  const res = await doc.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "pk = :p",
    ExpressionAttributeValues: { ":p": "PROP" },
    ProjectionExpression: "sk"
  }));
  return (res.Items ?? []).map(i => String(i.sk));
}

export const handler = async (event: any) => {
  const body: EventBody =
    event?.body ? JSON.parse(event.body) :
    (typeof event === "object" ? event : {});

  // 1) Determine propertyIds (from input or DB)
  let propertyIds = Array.isArray(body.propertyIds) ? body.propertyIds.filter(Boolean) : [];
  if (propertyIds.length === 0) {
    propertyIds = await loadPropertyIdsFromDb();
  }
  if (propertyIds.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "no properties found" }) };
  }

  // 2) Date window + include fields
  const startDate = resolveStart(body.startDate);
  const endDate = resolveEnd(body.endDate);
  const include = body.include ?? ["guest", "review", "financials", "properties"];
  const perPage = body.perPage ?? 100;

  // 3) Fetch + upsert in chunks
  const chunkSize = 10;
  let total = 0;
  let pages = 0;

  for (let i = 0; i < propertyIds.length; i += chunkSize) {
    const chunk = propertyIds.slice(i, i + chunkSize);

    for await (const page of fetchReservationsPaged({
      propertyIds: chunk,
      startDate,
      endDate,
      include,
      perPage
    })) {
      pages++;

      // Normalize into our reservation items
      const items = toReservationItems(page);

      // SAFE upsert (preserves existing guestId)
      await upsertReservations(items);

      // Build pointer indexes (idempotent)
      for (const r of items) {
        // Only writes when all 3 exist: conversation_id, propertyId, id
        await ensureConversationIndex(r);

        // Only creates/updates guest index when guestId is present
        const gid = (r as any).guestId as string | undefined;
        if (gid) {
          await ensureGuestReservationIndex(r, gid);
        }
      }

      total += items.length;
      console.log(`syncReservations: upserted ${items.length} (running total=${total})`);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      upserted: total,
      pages,
      startDate,
      endDate,
      properties: propertyIds.length
    })
  };
};
