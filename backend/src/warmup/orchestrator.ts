// src/warmup/orchestrator.ts
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambda = new LambdaClient({});

// List of Lambda function names to warm up
const FUNCTIONS_TO_WARM = [
  process.env.GET_GUEST_BY_CONVERSATION_ID_FN,
  process.env.GET_GUESTS_FN,
  process.env.GET_GUEST_BY_ID_FN,
  process.env.UPDATE_GUEST_HOST_NOTES_FN,
  process.env.GET_RESERVATIONS_FN,
  process.env.GET_RESERVATION_BY_ID_FN,
].filter(Boolean) as string[];

const WARMUP_PAYLOAD = JSON.stringify({ warmup: true });

export const handler = async () => {
  console.log(`Warming up ${FUNCTIONS_TO_WARM.length} Lambda functions...`);

  // Invoke all functions in parallel
  const invocations = FUNCTIONS_TO_WARM.map(async (functionName) => {
    try {
      await lambda.send(new InvokeCommand({
        FunctionName: functionName,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(WARMUP_PAYLOAD),
      }));
      console.log(`✓ Warmed up: ${functionName}`);
    } catch (error) {
      console.error(`✗ Failed to warm up ${functionName}:`, error);
    }
  });

  await Promise.all(invocations);
  console.log("Warmup complete");

  return { statusCode: 200, body: JSON.stringify({ warmedUp: FUNCTIONS_TO_WARM.length }) };
};
