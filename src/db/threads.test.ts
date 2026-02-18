/**
 * Integration tests for thread and message queries.
 *
 * Requires a local Postgres instance (Docker Compose). Skips if unreachable.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, hasDb, seedAccount, seedPrincipal } from "./test-helpers";
import {
  activeContext,
  activeTokens,
  children,
  coverMessages,
  createThread,
  estimateTokens,
  expand,
  findEmailThread,
  getThreadMeta,
  insertMessage,
  recentThreads,
  searchMessages,
  threadMessages,
  titleThread,
} from "./threads";

const HAS_DB = await hasDb();
let principalId: string;

// –
// Setup
// –

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
// estimateTokens (pure)
// –

describe("estimateTokens", () => {
  test("~4 chars per token", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  test("empty string is 0", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("ceiling rounds up", () => {
    expect(estimateTokens("abc")).toBe(1);
  });
});

// –
// Thread CRUD
// –

describe.skipIf(!HAS_DB)("createThread + getThreadMeta", () => {
  test("creates a chat thread", async () => {
    const id = await createThread(principalId, "chat");
    expect(id).toBeTruthy();

    const meta = await getThreadMeta(id, principalId);
    expect(meta).not.toBeNull();
    expect(meta!.channel).toBe("chat");
    expect(meta!.title).toBeNull();
  });

  test("creates a titled email thread", async () => {
    const id = await createThread(principalId, "email", "Test Subject");
    const meta = await getThreadMeta(id, principalId);
    expect(meta!.channel).toBe("email");
    expect(meta!.title).toBe("Test Subject");
  });

  test("returns null for wrong principal", async () => {
    const id = await createThread(principalId, "chat");
    const meta = await getThreadMeta(id, crypto.randomUUID());
    expect(meta).toBeNull();
  });
});

describe.skipIf(!HAS_DB)("titleThread", () => {
  test("updates thread title", async () => {
    const id = await createThread(principalId, "chat");
    await titleThread(id, "New Title");
    const meta = await getThreadMeta(id, principalId);
    expect(meta!.title).toBe("New Title");
  });
});

// –
// Messages
// –

describe.skipIf(!HAS_DB)("insertMessage", () => {
  test("inserts and returns message ID", async () => {
    const threadId = await createThread(principalId, "chat");
    const msgId = await insertMessage({
      content: "Hello",
      role: "user",
      threadId,
    });
    expect(msgId).toBeTruthy();
  });

  test("auto-estimates tokens", async () => {
    const threadId = await createThread(principalId, "chat");
    await insertMessage({
      content: "x".repeat(400),
      role: "user",
      threadId,
    });
    const tokens = await activeTokens(threadId);
    expect(tokens).toBe(100); // 400 chars / 4
  });

  test("respects explicit token count", async () => {
    const threadId = await createThread(principalId, "chat");
    await insertMessage({
      content: "Hello",
      role: "user",
      threadId,
      tokens: 42,
    });
    const tokens = await activeTokens(threadId);
    expect(tokens).toBe(42);
  });
});

// –
// Active context and summarization
// –

describe.skipIf(!HAS_DB)("activeContext + coverMessages", () => {
  test("returns all messages when none are summarized", async () => {
    const threadId = await createThread(principalId, "chat");
    await insertMessage({ content: "A", role: "user", threadId });
    await insertMessage({ content: "B", role: "assistant", threadId });

    const ctx = await activeContext(threadId);
    expect(ctx).toHaveLength(2);
    expect(ctx[0]!.content).toBe("A");
    expect(ctx[1]!.content).toBe("B");
  });

  test("excludes covered messages after summarization", async () => {
    const threadId = await createThread(principalId, "chat");
    const m1 = await insertMessage({ content: "A", role: "user", threadId });
    const m2 = await insertMessage({ content: "B", role: "assistant", threadId });

    // Create summary and cover originals.
    const summaryId = await insertMessage({
      content: "Summary of A and B",
      role: "summary",
      threadId,
    });
    await coverMessages([m1, m2], summaryId);

    const ctx = await activeContext(threadId);
    expect(ctx).toHaveLength(1);
    expect(ctx[0]!.role).toBe("summary");
    expect(ctx[0]!.content).toBe("Summary of A and B");
  });
});

describe.skipIf(!HAS_DB)("children + expand", () => {
  test("children returns direct children of a summary", async () => {
    const threadId = await createThread(principalId, "chat");
    const m1 = await insertMessage({ content: "A", role: "user", threadId });
    const m2 = await insertMessage({ content: "B", role: "assistant", threadId });
    const summaryId = await insertMessage({
      content: "Summary",
      role: "summary",
      threadId,
    });
    await coverMessages([m1, m2], summaryId);

    const kids = await children(summaryId);
    expect(kids).toHaveLength(2);
  });

  test("expand recursively resolves nested summaries", async () => {
    const threadId = await createThread(principalId, "chat");
    const m1 = await insertMessage({ content: "A", role: "user", threadId });
    const m2 = await insertMessage({ content: "B", role: "assistant", threadId });

    // First summary.
    const s1 = await insertMessage({ content: "Summary 1", role: "summary", threadId });
    await coverMessages([m1, m2], s1);

    // Second layer: another message + summary of s1 and new message.
    const m3 = await insertMessage({ content: "C", role: "user", threadId });
    const s2 = await insertMessage({ content: "Summary 2", role: "summary", threadId });
    await coverMessages([s1, m3], s2);

    // Expand should reach leaf messages A, B, C.
    const leaves = await expand(s2);
    expect(leaves).toHaveLength(3);
    const contents = leaves.map((l) => l.content).sort();
    expect(contents).toEqual(["A", "B", "C"]);
  });
});

describe.skipIf(!HAS_DB)("activeTokens", () => {
  test("sums tokens of active context", async () => {
    const threadId = await createThread(principalId, "chat");
    await insertMessage({ content: "x".repeat(40), role: "user", threadId }); // 10 tokens
    await insertMessage({ content: "x".repeat(80), role: "assistant", threadId }); // 20 tokens
    expect(await activeTokens(threadId)).toBe(30);
  });

  test("returns 0 for empty thread", async () => {
    const threadId = await createThread(principalId, "chat");
    expect(await activeTokens(threadId)).toBe(0);
  });
});

// –
// Thread listing and search
// –

describe.skipIf(!HAS_DB)("recentThreads", () => {
  test("returns threads ordered by latest activity", async () => {
    const t1 = await createThread(principalId, "chat");
    await insertMessage({ content: "Old", role: "user", threadId: t1 });

    // Small delay so timestamps differ.
    await Bun.sleep(10);
    const t2 = await createThread(principalId, "chat");
    await insertMessage({ content: "New", role: "user", threadId: t2 });

    const threads = await recentThreads(principalId);
    expect(threads.length).toBeGreaterThanOrEqual(2);
    expect(threads[0]!.id).toBe(t2);
  });

  test("filters by channel", async () => {
    await createThread(principalId, "chat");
    const emailId = await createThread(principalId, "email", "Test");

    const emails = await recentThreads(principalId, { channel: "email" });
    expect(emails.length).toBe(1);
    expect(emails[0]!.id).toBe(emailId);
  });

  test("includes snippet from latest message", async () => {
    const t = await createThread(principalId, "chat");
    await insertMessage({ content: "Hello world", role: "user", threadId: t });

    const threads = await recentThreads(principalId);
    const found = threads.find((th) => th.id === t);
    expect(found?.snippet).toContain("Hello world");
  });
});

describe.skipIf(!HAS_DB)("searchMessages", () => {
  test("finds messages matching query", async () => {
    const t = await createThread(principalId, "chat");
    await insertMessage({ content: "The quick brown fox", role: "user", threadId: t });
    await insertMessage({ content: "Lazy dog", role: "assistant", threadId: t });

    const results = await searchMessages(principalId, "brown fox");
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain("brown fox");
  });

  test("returns empty for no match", async () => {
    const t = await createThread(principalId, "chat");
    await insertMessage({ content: "Hello", role: "user", threadId: t });

    const results = await searchMessages(principalId, "xyznonexistent");
    expect(results).toHaveLength(0);
  });
});

describe.skipIf(!HAS_DB)("threadMessages", () => {
  test("excludes summary messages", async () => {
    const t = await createThread(principalId, "chat");
    await insertMessage({ content: "User msg", role: "user", threadId: t });
    await insertMessage({ content: "Summary", role: "summary", threadId: t });

    const msgs = await threadMessages(t);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe("user");
  });
});

// –
// Email thread resolution
// –

describe.skipIf(!HAS_DB)("findEmailThread", () => {
  test("finds thread by message reference", async () => {
    const t = await createThread(principalId, "email", "Test");
    await insertMessage({
      content: "Hi",
      metadata: { messageId: "ref-123" },
      role: "user",
      threadId: t,
    });

    const found = await findEmailThread(principalId, ["ref-123"], "Test");
    expect(found).toBe(t);
  });

  test("falls back to subject matching", async () => {
    const t = await createThread(principalId, "email", "Project Update");

    const found = await findEmailThread(principalId, [], "Project Update");
    expect(found).toBe(t);
  });

  test("returns null when no match", async () => {
    const found = await findEmailThread(principalId, ["no-ref"], "No Subject");
    expect(found).toBeNull();
  });
});
