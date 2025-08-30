// /backend/src/webhook/receiver.ts
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import crypto from "crypto";

const sqs = new SQSClient({});
const ssm = new SSMClient({});

const QUEUE_URL = process.env.QUEUE_URL!;
const WEBHOOK_SECRET_PARAM = process.env.WEBHOOK_SECRET_PARAM!;
const DEBUG = process.env.DEBUG_LOG_BODY === "true";

let cachedSecret: string | null = null;
async function getSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const res = await ssm.send(
    new GetParameterCommand({ Name: WEBHOOK_SECRET_PARAM, WithDecryption: true })
  );
  cachedSecret = res.Parameter?.Value ?? "";
  return cachedSecret;
}

function sha256Hex(payload: string) {
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

// Returns the naked hex string if header matches one of:
//  - "sha256=<hex>"
//  - "<hex>"
// Otherwise returns null.
function extractHexSignature(headerVal?: string | null): string | null {
  if (!headerVal) return null;
  let v = String(headerVal).trim();

  // strip quotes if any
  v = v.replace(/^"+|"+$/g, "");

  // allow "sha256=<hex>"
  const eq = v.indexOf("=");
  if (eq > 0 && v.slice(0, eq).toLowerCase().includes("sha256")) {
    v = v.slice(eq + 1).trim();
  }

  // must be 64 hex chars
  if (/^[a-f0-9]{64}$/i.test(v)) return v.toLowerCase();
  return null;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const reqId = event.requestContext.requestId;
  const sourceIp = (event.requestContext as any)?.identity?.sourceIp || "unknown";
  const ua =
    event.headers?.["user-agent"] ??
    event.headers?.["User-Agent"] ??
    "unknown";
  const contentType =
    event.headers?.["content-type"] ??
    event.headers?.["Content-Type"] ??
    "unknown";

  // Helpful: list header keys we actually received
  const headerKeys = Object.keys(event.headers || {}).map(k => k.toLowerCase());

  console.log(
    JSON.stringify({
      level: "info",
      msg: "webhook:received",
      reqId,
      path: event.path,
      method: event.httpMethod,
      sourceIp,
      userAgent: ua,
      contentType,
      headerKeys,
    })
  );

  // Get raw body exactly as sent
  const body = event.body ?? "";
  const raw = event.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;

  console.log(
    JSON.stringify({
      level: "debug",
      msg: "webhook:body_meta",
      reqId,
      bytes: Buffer.byteLength(raw, "utf8"),
      sha256: sha256Hex(raw),
      preview: DEBUG ? raw.slice(0, 512) : undefined,
    })
  );

  // Case-insensitive header map
  const H: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.headers || {})) {
    if (typeof v === "string") H[k.toLowerCase()] = v;
  }

  // Hospitable docs: header is literally "signature"
  // Keep fallbacks for safety.
  const providedSigHeader =
    H["signature"] ??
    H["x-hospitable-signature"] ??
    H["x-signature"] ??
    null;

  // Log what we think might be the signature (masked)
  if (providedSigHeader) {
    const mask =
      providedSigHeader.length > 12
        ? `${providedSigHeader.slice(0, 6)}…${providedSigHeader.slice(-6)}`
        : providedSigHeader;
    console.log(
      JSON.stringify({
        level: "debug",
        msg: "webhook:headers_probe",
        reqId,
        suspectedSigHeaders: { signature: mask, len: providedSigHeader.length },
      })
    );
  }

  try {
    const secret = await getSecret();

    // Expected: HMAC-SHA256(raw) hex
    const expectedHex = crypto
      .createHmac("sha256", secret)
      .update(raw, "utf8")
      .digest("hex");

    // Extract hex from header (supports "sha256=<hex>" or "<hex>")
    const providedHex = extractHexSignature(providedSigHeader);

    let sigOk = false;
    let mode: "hex" | "none" = "none";

    if (providedHex) {
      mode = "hex";
      // constant-time compare
      const a = Buffer.from(expectedHex, "hex");
      const b = Buffer.from(providedHex, "hex");
      sigOk = a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    console.log(
      JSON.stringify({
        level: "info",
        msg: "webhook:signature_check",
        reqId,
        hasSignatureHeader: Boolean(providedSigHeader),
        providedLen: providedHex ? 32 : 0,
        expectedLen: 32,
        mode,
        sigOk,
      })
    );

    if (!sigOk) {
      // While setting up, 401 is helpful; switch to 200 later to suppress retries.
      return { statusCode: 401, body: JSON.stringify({ error: "invalid signature" }) };
    }

    // Parse & enqueue
    const parsed = JSON.parse(raw);
    const out = {
      headers: event.headers,
      body: parsed,
      receivedAt: new Date().toISOString(),
      reqId,
      sourceIp,
      userAgent: ua,
    };

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify(out),
        MessageAttributes: {
          source: { DataType: "String", StringValue: "hospitable:webhook" },
        },
      })
    );

    console.log(
      JSON.stringify({
        level: "info",
        msg: "webhook:enqueued",
        reqId,
        queueUrl: QUEUE_URL,
      })
    );

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err: any) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "webhook:error",
        reqId,
        error: err?.message,
        stack: err?.stack,
      })
    );
    return { statusCode: 500, body: JSON.stringify({ error: "internal error" }) };
  }
};
