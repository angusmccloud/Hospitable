import { fetchProperties } from "./hospitableClient";
import { batchPut } from "./db";
import { toPropertyItems } from "./mappers";

export const handler = async () => {
  const props = await fetchProperties();
  const items = toPropertyItems(props);
  await batchPut(items);

  return {
    statusCode: 200,
    body: JSON.stringify({ upserted: items.length })
  };
};
