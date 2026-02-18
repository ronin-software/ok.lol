/**
 * Message lifecycle: persist agent output and auto-title threads.
 *
 * Both the chat route and email-receive handler use these functions
 * to complete the lifecycle after the agent loop finishes. Centralizing
 * persistence here means tool calls, assistant responses, and thread
 * titles are handled in one place regardless of transport channel.
 */

import { db } from "@/db";
import { thread } from "@/db/schema";
import { insertMessage, titleThread } from "@/db/threads";
import { assert } from "@/lib/assert";
import { gateway } from "@/lib/gateway";
import { generateText } from "ai";
import { eq } from "drizzle-orm";

/** Cheap model for auto-titling. */
const TITLE_MODEL = "anthropic/claude-3-5-haiku-20241022";

// –
// Output persistence
// –

/**
 * Persist agent output to a thread: assistant text and tool calls/results.
 *
 * Awaits the stream result to completion, so callers should only invoke
 * this after the HTTP response has been returned (for streaming) or
 * when they're ready to block (for non-streaming).
 *
 * Returns the assistant's text response.
 */
/** Minimal shape of a streamText result, decoupled from specific tool types. */
type AnyStreamResult = {
  steps: PromiseLike<Array<{ toolCalls: unknown[]; toolResults: unknown[] }>>;
  text: PromiseLike<string>;
};

export async function persistOutput(
  result: AnyStreamResult,
  threadId: string,
): Promise<string> {
  assert(threadId.length > 0, "threadId must be non-empty");

  const text = await result.text;
  const steps = await result.steps;

  // Persist tool calls and their results as separate rows (model context).
  for (const step of steps) {
    for (const call of step.toolCalls) {
      const c = call as Record<string, unknown>;
      await insertMessage({
        content: JSON.stringify({ input: c.input, name: c.toolName }),
        metadata: { toolCallId: c.toolCallId, toolName: c.toolName },
        role: "tool",
        threadId,
      });
    }
    for (const result of step.toolResults) {
      const r = result as Record<string, unknown>;
      const content = typeof r.result === "string"
        ? r.result
        : (r.result == null ? "(void)" : JSON.stringify(r.result));
      await insertMessage({
        content,
        metadata: { toolCallId: r.toolCallId, toolName: r.toolName },
        role: "tool",
        threadId,
      });
    }
  }

  // Build parts array so the UI can render tool invocations after refresh.
  const parts = buildParts(steps, text);

  if (parts.length > 0) {
    await insertMessage({
      content: text,
      parts,
      role: "assistant",
      threadId,
    });
  }

  return text;
}

/** Assemble UI-renderable parts from agent steps + final text. */
function buildParts(
  steps: Array<{ toolCalls: unknown[]; toolResults: unknown[] }>,
  text: string,
): unknown[] {
  const parts: unknown[] = [];

  for (const step of steps) {
    const resultsByCallId = new Map(
      (step.toolResults as Array<Record<string, unknown>>)
        .map((r) => [r.toolCallId, r]),
    );
    for (const call of step.toolCalls) {
      const c = call as Record<string, unknown>;
      const r = resultsByCallId.get(c.toolCallId) as Record<string, unknown> | undefined;
      parts.push({
        input: c.input,
        output: r?.result ?? null,
        state: "output-available",
        toolCallId: c.toolCallId,
        toolName: c.toolName,
        type: "dynamic-tool",
      });
    }
  }

  if (text.length > 0) {
    parts.push({ text, type: "text" });
  }

  return parts;
}

// –
// Auto-titling
// –

/**
 * Generate and save a title for an untitled thread.
 *
 * No-op if the thread already has a title. Uses a fast model
 * to generate a short (3-6 word) title from the conversation opener.
 */
export async function autoTitle(
  threadId: string,
  userText: string,
  assistantText: string,
): Promise<void> {
  assert(threadId.length > 0, "threadId must be non-empty");

  // Check if thread already has a title.
  const [row] = await db
    .select({ title: thread.title })
    .from(thread)
    .where(eq(thread.id, threadId))
    .limit(1);
  if (!row || row.title) return;

  if (userText.length === 0) return;

  const { text: title } = await generateText({
    model: gateway(TITLE_MODEL),
    prompt: `User: ${userText.slice(0, 500)}\n\nAssistant: ${assistantText.slice(0, 500)}`,
    system: "Generate a short title (3-6 words) for this conversation. Return only the title, nothing else.",
  });

  if (title.length > 0) {
    await titleThread(threadId, title.slice(0, 100));
  }
}
