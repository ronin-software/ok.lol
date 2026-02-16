import { db } from "@/db";
import { usage } from "@/db/schema";
import { assert } from "@/lib/assert";
import { computeCost } from "@/lib/pricing";
import { debit } from "@/lib/tigerbeetle";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { UIMessage } from "ai";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { withDefaults } from "../documents/defaults";
import type { OriginExecutionContext } from "../_execution-context";
import { logCall } from "../_log";
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
 * Usage recording fires automatically in `onFinish`.
 */

/** Anthropic provider instance. */
const anthropic = createAnthropic();

/** Default model ID (Anthropic provider format). */
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

/** Hard ceiling on agentic steps to bound cost and latency. */
const MAX_STEPS = 10;

/** Input to the agent loop. */
type Input = {
  /** UI messages for multi-turn chat. Converted to model messages internally. */
  messages?: UIMessage[];
  /** Optional model override. */
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
    documents,
    username: ectx.principal.username,
  });
  const tools = { ...origin.tools, ...remote.tools };

  // Convert UI messages to model messages, or use prompt directly.
  const messageInput = input.messages
    ? { messages: await convertToModelMessages(input.messages) }
    : { prompt: input.prompt! };

  return streamText({
    model: anthropic(modelId),
    ...messageInput,
    stopWhen: stepCountIs(MAX_STEPS),
    system,
    tools,
    onFinish: async ({ totalUsage }) => {
      await recordUsage(ectx, modelId, totalUsage);
    },
  });
}

// –
// Usage
// –

/** Model ID to pricing resource prefix. */
function pricingPrefix(model: string): string {
  const slash = model.lastIndexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}

/** Records token usage in the DB and debits the principal's account. */
async function recordUsage(
  ectx: OriginExecutionContext,
  model: string,
  tokens: { inputTokens?: number; outputTokens?: number },
) {
  const prefix = pricingPrefix(model);
  const inputTokens = BigInt(tokens.inputTokens ?? 0);
  const outputTokens = BigInt(tokens.outputTokens ?? 0);
  const inputCost = computeCost(`${prefix}:input`, inputTokens);
  const outputCost = computeCost(`${prefix}:output`, outputTokens);
  const totalCost = inputCost + outputCost;

  // Write usage rows for audit trail.
  const rows = [];
  if (inputTokens > 0n) {
    rows.push({
      accountId: ectx.principal.accountId,
      amount: inputTokens,
      cost: inputCost,
      hireId: ectx.caller?.hireId,
      resource: `${prefix}:input`,
    });
  }
  if (outputTokens > 0n) {
    rows.push({
      accountId: ectx.principal.accountId,
      amount: outputTokens,
      cost: outputCost,
      hireId: ectx.caller?.hireId,
      resource: `${prefix}:output`,
    });
  }
  if (rows.length > 0) {
    await db.insert(usage).values(rows);
  }

  // Debit credits. No-op if nothing was consumed.
  if (totalCost > 0n) {
    await debit(BigInt(ectx.principal.accountId), totalCost);
  }
}
