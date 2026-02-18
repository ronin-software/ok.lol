/**
 * Tests for thread summarization.
 *
 * Unit tests verify threshold logic. Integration tests (requiring DB
 * and AI Gateway) verify end-to-end summarization.
 */

import { cleanup, hasDb, seedAccount, seedPrincipal } from "@/db/test-helpers";
import { activeContext, activeTokens, createThread, insertMessage } from "@/db/threads";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { summarizeIfNeeded } from "./summarize";

const HAS_DB = await hasDb();
const HAS_GATEWAY = !!process.env.AI_GATEWAY_API_KEY;
let principalId: string;

beforeEach(async () => {
  if (!HAS_DB) return;
  await seedAccount();
  principalId = await seedPrincipal();
});

afterEach(async () => {
  if (!HAS_DB) return;
  await cleanup();
});

// –
// Threshold
// –

describe.skipIf(!HAS_DB)("summarizeIfNeeded — below threshold", () => {
  test("skips when tokens are below threshold", async () => {
    const threadId = await createThread(principalId, "chat");
    await insertMessage({ content: "Short message", role: "user", threadId });

    const summarized = await summarizeIfNeeded(threadId);
    expect(summarized).toBe(false);
  });
});

// –
// Full summarization (requires DB + AI gateway)
// –

describe.skipIf(!HAS_DB || !HAS_GATEWAY)("summarizeIfNeeded — above threshold", () => {
  test("summarizes when tokens exceed threshold", async () => {
    const threadId = await createThread(principalId, "chat");

    // Insert enough messages to exceed 160k tokens.
    // ~4 chars/token, so 640k chars total.
    const bigContent = "x".repeat(40_000);
    for (let i = 0; i < 17; i++) {
      await insertMessage({
        content: bigContent,
        role: i % 2 === 0 ? "user" : "assistant",
        threadId,
      });
    }

    const tokensBefore = await activeTokens(threadId);
    expect(tokensBefore).toBeGreaterThan(160_000);

    const summarized = await summarizeIfNeeded(threadId);
    expect(summarized).toBe(true);

    // After summarization, active context should be just the summary.
    const tokensAfter = await activeTokens(threadId);
    expect(tokensAfter).toBeLessThan(tokensBefore);

    const ctx = await activeContext(threadId);
    expect(ctx.some((m) => m.role === "summary")).toBe(true);
  }, 30_000);
});
