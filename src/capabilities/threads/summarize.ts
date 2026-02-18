/**
 * Thread summarization.
 *
 * When a thread's active context exceeds the token budget, this module
 * compresses it by calling a fast model to produce a summary, then
 * links the covered messages to the new summary via summaryId.
 *
 * Summaries are composable: a summary can itself be covered by a
 * higher-level summary, forming a tree that can be expanded on demand.
 */

import {
  activeContext,
  activeTokens,
  coverMessages,
  estimateTokens,
  insertMessage,
} from "@/db/threads";
import { assert } from "@/lib/assert";
import { createGateway, generateText } from "ai";

/** Fast model for summarization to minimize cost and latency. */
const SUMMARIZE_MODEL = "anthropic/claude-3-5-haiku-20241022";

/**
 * Summarize when active tokens exceed this threshold.
 * ~80% of a 200k context window, leaving room for system prompt + response.
 */
const TOKEN_THRESHOLD = 160_000;

/** Gateway instance for summarization calls. */
const gateway = createGateway();

/**
 * Check whether a thread needs summarization. If so, summarize.
 *
 * Returns true if summarization was performed. Designed to be called
 * before the main agent loop to keep context manageable.
 */
export async function summarizeIfNeeded(threadId: string): Promise<boolean> {
  const tokens = await activeTokens(threadId);
  if (tokens < TOKEN_THRESHOLD) return false;

  const context = await activeContext(threadId);
  assert(context.length > 0, "active context must be non-empty to summarize");

  // Build the text to summarize.
  const lines = context.map((m) => {
    const ts = m.createdAt.toISOString().slice(0, 19);
    return `[${ts}] ${m.role}: ${m.content}`;
  });

  const { text: summary } = await generateText({
    model: gateway(SUMMARIZE_MODEL),
    prompt: lines.join("\n\n"),
    system: [
      "Summarize this conversation. Preserve all important details, decisions,",
      "tool calls and their results, action items, and key facts. Be thorough",
      "but concise. This summary will replace the messages in context, so",
      "nothing critical should be lost. Write in third person past tense.",
    ].join(" "),
  });

  assert(summary.length > 0, "summary must be non-empty");

  // Insert the summary as a message, then cover the original messages.
  const summaryId = await insertMessage({
    content: summary,
    role: "summary",
    threadId,
    tokens: estimateTokens(summary),
  });

  const coveredIds = context.map((m) => m.id);
  await coverMessages(coveredIds, summaryId);

  return true;
}
