// /backend/src/webhook/receiver.ts
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import crypto from "crypto";

const sqs = new SQSClient({});
const ssm = new SSMClient({});

const QUEUE_URL = process.env.QUEUE_URL!;
const WEBHOOK_SECRET_PARAM = process.env.WEBHOOK_SECRET_PARAM!;
const DEBUG = (process.env.DEBUG_LOG_BODY === "true"); // optional: echo small body snippets for debugging

let cachedSecret: string | null = null;
async function getSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const res = await ssm.send(new GetParameterCommand({
    Name: WEBHOOK_SECRET_PARAM,
    WithDecryption: true
  }));
  cachedSecret = res.Parameter?.Value ?? "";
  return cachedSecret;
}

function sha256HmacHex(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function sha256Hex(payload: string) {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const reqId = event.requestContext.requestId;
  const sourceIp = (event.requestContext as any)?.identity?.sourceIp || "unknown";
  const userAgent = (event.headers?.["User-Agent"] ?? event.headers?.["user-agent"] ?? "unknown");

  // Basic request envelope logging (no secrets/PII)
  console.log(JSON.stringify({
    level: "info",
    msg: "webhook:received",
    reqId,
    path: event.path,
    method: event.httpMethod,
    sourceIp,
    userAgent,
    contentType: event.headers?.["content-type"] || event.headers?.["Content-Type"] || "unknown",
  }));

  // Raw body
  const body = event.body ?? "";
  const isBase64 = event.isBase64Encoded === true;
  const raw = isBase64 ? Buffer.from(body, "base64").toString("utf8") : body;

  // Log body characteristics only (length + hash). Optional short preview in DEBUG.
  console.log(JSON.stringify({
    level: "debug",
    msg: "webhook:body_meta",
    reqId,
    bytes: Buffer.byteLength(raw, "utf8"),
    sha256: sha256Hex(raw),
    preview: DEBUG ? raw.slice(0, 512) : undefined, // at most 512 chars; set DEBUG_LOG_BODY=true if you want this
  }));

  // Signature verification (Hospitable doc uses HMAC-SHA256)
  const providedSig =
    event.headers["x-hospitable-signature"] ||
    event.headers["X-Hospitable-Signature"] ||
    event.headers["x-signature"] ||
    "";

  try {
    const secret = await getSecret();
    const expected = sha256HmacHex(raw, secret);

    const sigOk = crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(String(providedSig || ""), "utf8"),
    );

    console.log(JSON.stringify({
      level: "info",
      msg: "webhook:signature_check",
      reqId,
      hasSignatureHeader: Boolean(providedSig),
      sigOk
    }));

    if (!sigOk) {
      // 200 to avoid retries? Up to you. Here we return 401 to surface misconfig early.
      return { statusCode: 401, body: JSON.stringify({ error: "invalid signature" }) };
    }

    // Enqueue full payload (headers + body) for async processing
    const out = {
      headers: event.headers,
      body: JSON.parse(raw), // SQS message will have parsed JSON
      receivedAt: new Date().toISOString(),
      reqId,
      sourceIp,
      userAgent
    };

    await sqs.send(new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(out),
      MessageAttributes: {
        source: { DataType: "String", StringValue: "hospitable:webhook" }
      }
    }));

    console.log(JSON.stringify({
      level: "info",
      msg: "webhook:enqueued",
      reqId,
      queueUrl: QUEUE_URL
    }));

    // Acknowledge quickly
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (err: any) {
    console.error(JSON.stringify({
      level: "error",
      msg: "webhook:error",
      reqId,
      error: err?.message,
      stack: err?.stack
    }));
    // Returning 500 makes Hospitable retry. While testing that’s often useful.
    return { statusCode: 500, body: JSON.stringify({ error: "internal error" }) };
  }
};
