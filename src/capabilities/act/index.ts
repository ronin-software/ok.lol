import { db } from "@/db";
import { usage } from "@/db/schema";
import { assert } from "@/lib/assert";
import { env } from "@/lib/env";
import { debit } from "@/lib/tigerbeetle";
import type { UIMessage } from "ai";
import {
  convertToModelMessages,
  createGateway,
  stepCountIs,
  streamText,
} from "ai";
import type { OriginExecutionContext } from "../_execution-context";
import { logCall } from "../_log";
import { withDefaults } from "../documents/defaults";
import { assemblePrompt } from "./prompt";
import { makeTools } from "./tools";
import * as workers from "./workers";

/**
 * The agent loop. Processes input through multi-step inference, calling
 * tools as needed until the model finishes or the step limit is reached.
 *
 * Transport-agnostic: returns a stream result that callers consume
 * based on their needs:
 *
 * - Streaming (HTTP):     `result.toUIMessageStreamResponse()`
 * - Non-streaming (email): `await result.text`
 *
 * Usage recording fires automatically in `onFinish`. Cost is reported
 * by the Vercel AI Gateway via `providerMetadata.gateway.cost`.
 */

/** AI Gateway provider instance. */
const gateway = createGateway();

/** Default model ID (gateway format: provider/model). */
const DEFAULT_MODEL = "anthropic/claude-sonnet-4-5-20250929";

/** Hard ceiling on agentic steps to bound cost and latency. */
const MAX_STEPS = 10;

/** Input to the agent loop. */
type Input = {
  /** UI messages for multi-turn chat. Converted to model messages internally. */
  messages?: UIMessage[];
  /** Optional model override (gateway format: provider/model). */
  model?: string;
  /** Single prompt for one-shot invocations. */
  prompt?: string;
};

/** Runs the agent loop. Returns a stream result for the caller to consume. */
export default async function act(ectx: OriginExecutionContext, input: Input) {
  assert(
    input.prompt != null || input.messages != null,
    "prompt or messages required",
  );
  await logCall(ectx, "act", input);
  const modelId = input.model ?? DEFAULT_MODEL;

  // Build origin tools and discover remote worker tools.
  const origin = makeTools(ectx);
  const endpoints = await workers.discover(ectx.principal.accountId);
  const remote = workers.makeTools(endpoints);

  // Assemble context.
  const documents = withDefaults(ectx.principal.documents);
  const system = assemblePrompt({
    caller: ectx.caller,
    capabilities: [...origin.capabilities, ...remote.directory],
    credits: ectx.principal.credits,
    domain: env.EMAIL_DOMAIN,
    documents,
    name: ectx.principal.name,
    username: ectx.principal.username,
  });
  const tools = { ...origin.tools, ...remote.tools };

  // Convert UI messages to model messages, or use prompt directly.
  const messageInput = input.messages
    ? { messages: await convertToModelMessages(input.messages) }
    : { prompt: input.prompt! };

  return streamText({
    model: gateway(modelId),
    ...messageInput,
    stopWhen: stepCountIs(MAX_STEPS),
    system,
    tools,
    onFinish: async ({ providerMetadata }) => {
      await recordUsage(ectx, modelId, providerMetadata);
    },
  });
}

// –
// Usage
// –

/** Converts a dollar string (e.g. "0.0045405") to micro-USD bigint. */
function dollarsToMicro(dollars: string): bigint {
  const micro = Math.round(parseFloat(dollars) * 1_000_000);
  return BigInt(micro);
}

/** Records gateway-reported cost in the DB and debits the principal's account. */
async function recordUsage(
  ectx: OriginExecutionContext,
  model: string,
  metadata: Record<string, Record<string, unknown>> | undefined,
) {
  const costStr = (metadata?.gateway?.cost as string) ?? "0";
  const cost = dollarsToMicro(costStr);
  if (cost <= 0n) return;

  // Audit trail.
  await db.insert(usage).values({
    accountId: ectx.principal.accountId,
    amount: 1n,
    cost,
    hireId: ectx.caller?.hireId,
    resource: model,
  });

  // Debit credits.
  await debit(BigInt(ectx.principal.accountId), cost);
}
