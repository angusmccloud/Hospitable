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

/** Convert a signature header value to a Buffer, supporting:
 *  - "sha256=<hex>"
 *  - "<hex>"
 *  - base64
 */
function parseSignatureToBuffer(headerVal: string | undefined | null): Buffer | null {
  if (!headerVal) return null;
  let v = String(headerVal).trim();

  // Strip algo prefix if present: e.g. "sha256=abc..."
  const eqIdx = v.indexOf("=");
  if (eqIdx > 0 && v.slice(0, eqIdx).toLowerCase().includes("sha256")) {
    v = v.slice(eqIdx + 1);
  }
  v = v.trim().replace(/^"+|"+$/g, ""); // strip any surrounding quotes

  // Try hex (64 hex chars for SHA-256)
  if (/^[a-f0-9]{64}$/i.test(v)) {
    return Buffer.from(v, "hex");
  }
  // Try base64
  try {
    const b = Buffer.from(v, "base64");
    if (b.length > 0) return b;
  } catch {
    // fallthrough
  }
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
    })
  );

  // Get raw body exactly as sent to the Lambda (decode if API GW set base64 flag)
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

  // Normalize header map (case-insensitive)
  const headersLower: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.headers || {})) {
    if (typeof v === "string") headersLower[k.toLowerCase()] = v;
  }

  const providedSigRaw =
    headersLower["x-hospitable-signature"] ??
    headersLower["x-signature"] ??
    headersLower["x-hook-signature"] ??
    "";

  try {
    const secret = await getSecret();

    // Expected HMAC (as Buffer)
    const expectedBuf = crypto.createHmac("sha256", secret).update(raw, "utf8").digest();

    // Incoming signature as Buffer (hex/base64 supported)
    const providedBuf = parseSignatureToBuffer(providedSigRaw);

    const comparable =
      providedBuf !== null && providedBuf.length === expectedBuf.length;

    const sigOk = comparable
      ? crypto.timingSafeEqual(expectedBuf, providedBuf!)
      : false;

    console.log(
      JSON.stringify({
        level: "info",
        msg: "webhook:signature_check",
        reqId,
        hasSignatureHeader: Boolean(providedSigRaw),
        providedLen: providedBuf?.length ?? 0,
        expectedLen: expectedBuf.length,
        comparable,
        sigOk,
      })
    );

    if (!sigOk) {
      // 401 makes it obvious during setup; switch to 200 to suppress retries if desired
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
