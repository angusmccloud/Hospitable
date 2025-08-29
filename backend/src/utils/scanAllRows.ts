import { DynamoDBDocumentClient, ScanCommand, ScanCommandInput, ScanCommandOutput } from "@aws-sdk/lib-dynamodb";

/**
 * Scan all rows in a DynamoDB table, paginating through all results.
 * If findOne is true, returns the first matching row found by the filter callback.
 * Otherwise, returns all matching rows.
 */
export async function scanAllRows<T = Record<string, any>>({
  doc,
  params,
  filter,
  findOne = false,
}: {
  doc: DynamoDBDocumentClient;
  params: Omit<ScanCommandInput, "ExclusiveStartKey">;
  filter?: (row: T) => boolean;
  findOne?: boolean;
}): Promise<T | T[] | null> {
  let ExclusiveStartKey: Record<string, any> | undefined = undefined;
  const results: T[] = [];
  do {
    const scanParams: ScanCommandInput = { ...params, ExclusiveStartKey };
    const res: ScanCommandOutput = await doc.send(new ScanCommand(scanParams));
    const items = (res.Items ?? []) as T[];
    if (filter) {
      for (const item of items) {
        if (filter(item)) {
          if (findOne) return item;
          results.push(item);
        }
      }
    } else {
      if (findOne && items.length > 0) return items[0];
      results.push(...items);
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return findOne ? null : results;
}
