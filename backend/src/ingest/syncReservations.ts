import { batchPut, doc, TABLE } from "./db";
import { fetchReservationsPaged } from "./hospitableClient";
import { toReservationItems } from "./mappers";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

type EventBody = {
  propertyIds?: string[];      // optional now
  startDate?: string;          // 'YYYY-MM-DD' or 'LAST_30_DAYS'
  endDate?: string;            // 'YYYY-MM-DD' or 'PLUS_2_YEARS'
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
  const body =
    event?.body ? JSON.parse(event.body) :
    (typeof event === "object" ? event : {});

  let propertyIds: string[] = Array.isArray(body.propertyIds) ? body.propertyIds.filter(Boolean) : [];
  if (propertyIds.length === 0) propertyIds = await loadPropertyIdsFromDb();
  if (propertyIds.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "no properties found" }) };
  }

  const startDate = resolveStart(body.startDate);
  const endDate = resolveEnd(body.endDate);

  let total = 0;
  const chunkSize = 10; // tune as needed

  for (let i = 0; i < propertyIds.length; i += chunkSize) {
    const chunk = propertyIds.slice(i, i + chunkSize);

    for await (const page of fetchReservationsPaged({
      propertyIds: chunk,
      startDate,
      endDate,
      include: body.include,  // we'll auto-append 'properties' in the client
      perPage: body.perPage
    })) {
      const items = toReservationItems(page); // propertyId is derived per row
      total += items.length;
      await batchPut(items);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ upserted: total, startDate, endDate, propertiesQueried: propertyIds.length })
  };
};