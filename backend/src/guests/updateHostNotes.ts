// src/guests/updateHostNotes.ts
import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME || 'HospitableData';

/**
 * Updates the guest's hostNotes and updatedAt only.
 * Path: PUT /guests/{guestId}/hostNotes
 * Body: { hostNotes: string }
 *
 * NOTE: This assumes guests are stored at:
 *   pk = `GUEST#${guestId}`
 *   sk = `PROFILE`
 * If your SK differs, change SK constant below.
 */
const SK = 'PROFILE';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const guestId = event.pathParameters?.guestId;
    if (!guestId) {
      return resp(400, { message: 'Missing guestId in path' });
    }

    if (!event.body) {
      return resp(400, { message: 'Missing request body' });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(event.body);
    } catch {
      return resp(400, { message: 'Body must be JSON' });
    }

    const hostNotes = (parsed as any)?.hostNotes;
    if (typeof hostNotes !== 'string') {
      return resp(400, { message: '`hostNotes` must be a string' });
    }
    // Keep it sane; adjust if you want more/less.
    if (hostNotes.length > 8000) {
      return resp(413, { message: '`hostNotes` too long (max 8000 chars)' });
    }

    const nowIso = new Date().toISOString();
    const key = marshall({ pk: `GUEST#${guestId}`, sk: SK });

    const cmd = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: key,
      UpdateExpression: 'SET hostNotes = :n, updatedAt = :ts',
      ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
      ExpressionAttributeValues: marshall({
        ':n': hostNotes,
        ':ts': nowIso,
      }),
      ReturnValues: 'UPDATED_NEW',
    });

    await ddb.send(cmd);

    // 204 (no body) keeps it simple
    return {
      statusCode: 204,
      headers: cors(),
    };
  } catch (err: any) {
    // Conditional check failure means the guest item doesn't exist
    const msg =
      err?.name === 'ConditionalCheckFailedException'
        ? 'Guest not found'
        : err?.message || 'Internal error';
    const code = err?.name === 'ConditionalCheckFailedException' ? 404 : 500;
    return resp(code, { message: msg });
  }
};

// ---------- helpers ----------
function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
      'Content-Type': 'application/json',
  };
}
function resp(statusCode: number, body?: unknown) {
  return {
    statusCode,
    headers: cors(),
    body: body ? JSON.stringify(body) : undefined,
  };
}
