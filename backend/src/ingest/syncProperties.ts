// src/ingest/syncProperties.ts
import { upsertProperties } from "./db";
import { fetchPropertiesPaged } from "./hospitableClient";
import { toPropertyItems } from "./mappers";

type EventBody = {
  perPage?: number;
};

export const handler = async (event: any) => {
  const body: EventBody =
    event?.body ? JSON.parse(event.body) :
    (typeof event === "object" ? event : {});

  const perPage = body.perPage ?? 100;

  let total = 0;
  let pages = 0;

  for await (const page of fetchPropertiesPaged( perPage )) {
    pages++;

    // your mapper should produce: [{ pk: "PROP", sk: "<propertyId>", ...attrs }]
    const items = toPropertyItems(page);

    await upsertProperties(items);
    total += items.length;

    console.log(`syncProperties: upserted ${items.length} (running total=${total})`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ upserted: total, pages }),
  };
};
