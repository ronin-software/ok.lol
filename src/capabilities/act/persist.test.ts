/**
 * Tests for persistOutput — verifies that assistant messages
 * include tool-invocation parts for the UI.
 */

import { db } from "@/db";
import { message } from "@/db/schema";
import { cleanup, hasDb, seedAccount, seedPrincipal } from "@/db/test-helpers";
import { createThread } from "@/db/threads";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { persistOutput } from "./persist";

const HAS_DB = await hasDb();
let principalId: string;
let threadId: string;

beforeEach(async () => {
  if (!HAS_DB) return;
  await seedAccount();
  principalId = await seedPrincipal();
  threadId = await createThread(principalId, "chat");
});

afterEach(async () => {
  if (!HAS_DB) return;
  await cleanup();
});

/** Build a fake stream result for testing. */
function fakeResult(
  text: string,
  steps: Array<{ toolCalls: unknown[]; toolResults: unknown[] }> = [],
) {
  return {
    steps: Promise.resolve(steps),
    text: Promise.resolve(text),
  };
}

describe.skipIf(!HAS_DB)("persistOutput", () => {
  test("persists text-only response with text part", async () => {
    await persistOutput(fakeResult("Hello!"), threadId);

    const rows = await db
      .select()
      .from(message)
      .where(eq(message.threadId, threadId));

    const assistant = rows.find((r) => r.role === "assistant");
    expect(assistant).toBeDefined();
    expect(assistant!.content).toBe("Hello!");

    const parts = assistant!.parts as unknown[];
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ text: "Hello!", type: "text" });
  });

  test("persists tool invocations in parts", async () => {
    const steps = [{
      toolCalls: [{
        input: { email: "a@b.com" },
        toolCallId: "call-1",
        toolName: "lookup_contact",
      }],
      toolResults: [{
        result: { name: "Alice" },
        toolCallId: "call-1",
        toolName: "lookup_contact",
      }],
    }];

    await persistOutput(fakeResult("Done.", steps), threadId);

    const rows = await db
      .select()
      .from(message)
      .where(eq(message.threadId, threadId));

    const assistant = rows.find((r) => r.role === "assistant");
    const parts = assistant!.parts as Array<Record<string, unknown>>;

    // Tool invocation + text part.
    expect(parts).toHaveLength(2);

    const toolPart = parts.find((p) => p.type === "dynamic-tool");
    expect(toolPart).toMatchObject({
      input: { email: "a@b.com" },
      output: { name: "Alice" },
      state: "output-available",
      toolCallId: "call-1",
      toolName: "lookup_contact",
      type: "dynamic-tool",
    });

    const textPart = parts.find((p) => p.type === "text");
    expect(textPart).toMatchObject({ text: "Done.", type: "text" });
  });

  test("persists tool rows separately for model context", async () => {
    const steps = [{
      toolCalls: [{
        input: {},
        toolCallId: "call-2",
        toolName: "list_threads",
      }],
      toolResults: [{
        result: "3 threads",
        toolCallId: "call-2",
        toolName: "list_threads",
      }],
    }];

    await persistOutput(fakeResult("Here you go.", steps), threadId);

    const rows = await db
      .select()
      .from(message)
      .where(eq(message.threadId, threadId));

    const toolRows = rows.filter((r) => r.role === "tool");
    // One for the call, one for the result.
    expect(toolRows).toHaveLength(2);
  });

  test("no messages persisted for empty response with no tools", async () => {
    await persistOutput(fakeResult(""), threadId);

    const rows = await db
      .select()
      .from(message)
      .where(eq(message.threadId, threadId));

    expect(rows).toHaveLength(0);
  });
});
