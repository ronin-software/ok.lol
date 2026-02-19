import { assert } from "@/lib/assert";
import { dollarsToMicro, ensureFunded, recordUsage } from "@/lib/billing";
import { env } from "@/lib/env";
import { gateway } from "@/lib/gateway";
import { embedText, filterDocuments } from "@/lib/relevance";
import type { UIMessage } from "ai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
} from "ai";
import type { OriginExecutionContext } from "../context";
import { withDefaults } from "../documents/defaults";
import { logCall } from "../log";
import { assemblePrompt } from "./prompt";
import { buildTools } from "./tools";

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
 * Usage recording fires automatically in `onFinish`. Message persistence
 * is handled by callers via `dispatch.persistOutput`.
 */

/** Default model ID (gateway format: provider/model). */
const DEFAULT_MODEL = "anthropic/claude-sonnet-4-5-20250929";

/** Hard ceiling on agentic steps to bound cost and latency. */
const MAX_STEPS = 10;

/** Input to the agent loop. */
type Input = {
  /** Cross-thread awareness injected by the entry point (email history, recent threads, etc). */
  context?: string;
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

  // Gate: reject if the account can't fund billable work.
  await ensureFunded(ectx.principal.accountId);

  await logCall(ectx, "act", input);
  const modelId = input.model ?? DEFAULT_MODEL;

  // Derive the prompt text for embedding (used for activation filtering).
  const promptText = input.prompt
    ?? input.messages?.filter((m) => m.role === "user").map((m) =>
      m.parts.filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
        .map((p) => p.text).join(""),
    ).at(-1)
    ?? "";

  // Build tools and embed prompt in parallel.
  const hasActivation = ectx.principal.documents.some((d) => d.activation);
  const [{ capabilities, tools }, promptEmbedding] = await Promise.all([
    buildTools(ectx),
    hasActivation && promptText ? embedText(promptText) : Promise.resolve(undefined),
  ]);

  // Merge defaults, then filter by activation relevance.
  const allDocuments = withDefaults(ectx.principal.documents, capabilities);
  const documents = promptEmbedding
    ? (await filterDocuments(allDocuments, promptEmbedding)).injected
    : allDocuments;

  const system = assemblePrompt({
    caller: ectx.caller,
    capabilities,
    context: input.context,
    credits: ectx.principal.credits,
    domain: env.EMAIL_DOMAIN,
    documents,
    name: ectx.principal.name,
    username: ectx.principal.username,
  });

  // FIXME(@danscan): Does this belong here?
  // Strip stored tool-call parts before converting — the model doesn't need
  // prior tool invocations in its context, only the text they produced.
  const messageInput = input.messages
    ? {
        messages: await convertToModelMessages(
          input.messages.map((m) =>
            m.role === "assistant"
              ? { ...m, parts: m.parts.filter((p) => p.type !== "dynamic-tool") }
              : m,
          ),
        ),
      }
    : { prompt: input.prompt! };

  return streamText({
    model: gateway(modelId),
    ...messageInput,
    stopWhen: stepCountIs(MAX_STEPS),
    system,
    tools,
    onFinish: async ({ providerMetadata }) => {
      await recordModelUsage(ectx, modelId, providerMetadata);
    },
  });
}

// –
// Usage
// –

/** Records gateway-reported cost via the billing module. */
async function recordModelUsage(
  ectx: OriginExecutionContext,
  model: string,
  metadata: Record<string, Record<string, unknown>> | undefined,
) {
  const costStr = (metadata?.gateway?.cost as string) ?? "0";
  const cost = dollarsToMicro(costStr);
  if (cost <= 0n) return;

  await recordUsage({
    accountId: ectx.principal.accountId,
    amount: 1n,
    cost,
    hireId: ectx.caller?.hireId,
    resource: model,
  });
}
