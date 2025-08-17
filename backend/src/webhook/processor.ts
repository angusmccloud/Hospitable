import type { SQSEvent, SQSBatchResponse } from "aws-lambda";
import crypto from "crypto";
import { batchPut } from "../ingest/db";
import { toReservationItems, toPropertyItems } from "../ingest/mappers";

const DEBUG = process.env.DEBUG_LOG_BODY === "true";

// ---- small helpers (no PII) ----
const sha256Hex = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const safeJson = (v: unknown) => {
  try { return JSON.stringify(v); } catch { return '"<unstringifiable>"'; }
};

// Try to infer an event/action key from various webhook shapes
function getAction(obj: any): string | undefined {
  return obj?.action || obj?.event || obj?.type || obj?.event_type;
}

// Heuristic for “this looks like a reservation payload”
function looksLikeReservation(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;
  if (obj.entity === "reservation") return true;
  if (obj.reservation || obj.reservation_id) return true;
  // payloads that are directly the reservation row (have id + dates or properties)
  const hasCore = obj.id && (obj.arrival_date || obj.departure_date || obj.properties);
  return Boolean(hasCore);
}

// Heuristic for property payloads
function looksLikeProperty(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;
  if (obj.entity === "property") return true;
  if (obj.property) return true;
  if (obj.id && obj.name && !looksLikeReservation(obj)) return true;
  return false;
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const failures: { itemIdentifier: string }[] = [];

  console.log(JSON.stringify({
    level: "info",
    msg: "sqs:batch:received",
    recordCount: event.Records.length,
  }));

  for (const rec of event.Records) {
    const msgId = rec.messageId;

    // base metadata log (size + hash only)
    const bodyStr = rec.body ?? "";
    console.log(JSON.stringify({
      level: "debug",
      msg: "sqs:record:meta",
      msgId,
      approxReceiveCount: rec.attributes?.ApproximateReceiveCount,
      bodyBytes: Buffer.byteLength(bodyStr, "utf8"),
      bodySha256: sha256Hex(bodyStr),
      preview: DEBUG ? bodyStr.slice(0, 512) : undefined,
    }));

    try {
      // Envelope from receiver: { headers, body, receivedAt, ... }
      const envelope = JSON.parse(bodyStr);
      const data = envelope?.body ?? envelope; // tolerate direct-send to queue during tests
      const action = getAction(data);

      console.log(JSON.stringify({
        level: "info",
        msg: "sqs:record:parsed",
        msgId,
        action,
        hasPropertiesArray: Array.isArray(data?.properties),
        entity: data?.entity,
      }));

      if (looksLikeReservation(data)) {
        // Normalize to an array of rows for mapper
        const row = data.reservation ?? data;
        const items = toReservationItems([row]);
        await batchPut(items);

        console.log(JSON.stringify({
          level: "info",
          msg: "sqs:reservation:upserted",
          msgId,
          count: items.length,
          // minimal identifiers only
          ids: items.map(i => i.id).slice(0, 5), // cap to avoid noisy logs
        }));
      } else if (looksLikeProperty(data)) {
        // Accept shapes: { property: {id,name,...} } or direct {id,name,...}
        const prop = data.property ?? data;
        const props = [{ id: String(prop.id), name: String(prop.name ?? "") }];
        const items = toPropertyItems(props as any);
        await batchPut(items);

        console.log(JSON.stringify({
          level: "info",
          msg: "sqs:property:upserted",
          msgId,
          count: items.length,
          ids: items.map(i => i.sk).slice(0, 5),
        }));
      } else {
        // Unknown shape: log and ACK (so the DLQ isn’t polluted during discovery)
        console.warn(JSON.stringify({
          level: "warn",
          msg: "sqs:unknown:webhook_shape",
          msgId,
          action,
          keys: Object.keys(data || {}),
        }));
      }
    } catch (err: any) {
      console.error(JSON.stringify({
        level: "error",
        msg: "sqs:record:failed",
        msgId,
        error: err?.message,
        stack: err?.stack,
      }));
      // Fail this specific record so Lambda reports partial batch item failures
      failures.push({ itemIdentifier: msgId });
    }
  }

  // Let Lambda/SQS re-drive only the failed records
  const response: SQSBatchResponse = { batchItemFailures: failures };
  console.log(JSON.stringify({
    level: failures.length ? "warn" : "info",
    msg: "sqs:batch:complete",
    failures: failures.map(f => f.itemIdentifier),
  }));
  return response;
};
