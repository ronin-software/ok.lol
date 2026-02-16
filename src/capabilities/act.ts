import { db } from "@/db";
import { usage } from "@/db/schema";
import { assert } from "@/lib/assert";
import { computeCost } from "@/lib/pricing";
import { debit } from "@/lib/tigerbeetle";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { Capability } from "@ok.lol/capability";
import { generateText, stepCountIs } from "ai";
import { withDefaults } from "./_defaults";
import type { OriginExecutionContext } from "./_execution-context";
import { logCall } from "./_log";
import { assemblePrompt } from "./_prompt";
import { makeTools, toolDirectory } from "./_tools";

/**
 * The agent loop. Processes a message through multi-step inference,
 * calling tools as needed until the model is done or the step limit
 * is reached.
 *
 * Uses `@ai-sdk/anthropic` directly instead of the Vercel AI Gateway
 * because the gateway strips `type` from tool JSON schemas server-side,
 * breaking all tool calls. Switch to `gateway("anthropic/...")` from `ai`
 * once https://github.com/vercel/ai/issues/11869 is resolved.
 */

/** Default model ID (Anthropic provider format). */
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

/** Anthropic provider instance. */
const anthropic = createAnthropic();

/** Hard ceiling on agentic steps to bound cost and latency. */
const MAX_STEPS = 10;

/** Input to the act capability. */
type Input = {
  /** Optional model override. */
  model?: string;
  /** The message to process. */
  prompt: string;
};

/** Output from the act capability. */
type Output = {
  /** The agent's final text response. */
  text: string;
};

/** Processes a message through the agent loop. */
const act: Capability<OriginExecutionContext, Input, Output> = {
  available: async () => true,

  async call(ectx, input) {
    assert(input.prompt.length > 0, "prompt must be non-empty");
    await logCall(ectx, "act", input);
    const modelId = input.model ?? DEFAULT_MODEL;

    // Assemble context.
    const documents = withDefaults(ectx.principal.documents);
    const system = assemblePrompt({
      caller: ectx.caller,
      capabilities: toolDirectory,
      credits: ectx.principal.credits,
      documents,
      username: ectx.principal.username,
    });
    const tools = makeTools(ectx);

    // Run the agent loop.
    const result = await generateText({
      model: anthropic(modelId),
      prompt: input.prompt,
      stopWhen: stepCountIs(MAX_STEPS),
      system,
      tools,
    });

    // Record usage and debit credits.
    await recordUsage(ectx, modelId, result.totalUsage);

    return { text: result.text };
  },

  description: "Processes a message and takes actions until completion",
  inputSchema: {},
  name: "act",
  outputSchema: {},
  setup: async () => {},
};

export default act;

// –
// Usage
// –

/** Model ID to pricing resource prefix. */
function pricingPrefix(model: string): string {
  // "anthropic/claude-sonnet-4.5" → "claude-sonnet-4.5"
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
