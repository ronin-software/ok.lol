/**
 * Tests for the unified `send` capability.
 *
 * Schema tests are pure. Integration tests require Postgres and
 * skip gracefully when unreachable.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { message } from "@/db/schema";
import { cleanup, hasDb, seedAccount, seedPrincipal } from "@/db/test-helpers";
import { createThread } from "@/db/threads";
import send from "./send";
import { OWNER_CONTACT } from "@/lib/access";
import type { OriginExecutionContext } from "./context";

// –
// Schema (pure)
// –

describe("send schema", () => {
  test("name and description", () => {
    expect(send.name).toBe("send");
    expect(send.description).toBeTruthy();
  });

  test("accepts minimal input (content only)", () => {
    const result = send.inputSchema.safeParse({ content: "hello" });
    expect(result.success).toBe(true);
  });

  test("accepts content + threadId", () => {
    const result = send.inputSchema.safeParse({
      content: "hello",
      threadId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  test("accepts email delivery", () => {
    const result = send.inputSchema.safeParse({
      content: "Hello Alice",
      subject: "Contract",
      to: "alice@example.com",
    });
    expect(result.success).toBe(true);
  });

  test('accepts to: "owner"', () => {
    const result = send.inputSchema.safeParse({
      content: "Notification",
      to: "owner",
    });
    expect(result.success).toBe(true);
  });

  test("accepts cc as string", () => {
    const result = send.inputSchema.safeParse({
      cc: "bob@example.com",
      content: "Hello",
      to: "alice@example.com",
    });
    expect(result.success).toBe(true);
  });

  test("accepts cc as array", () => {
    const result = send.inputSchema.safeParse({
      cc: ["bob@example.com", "carol@example.com"],
      content: "Hello",
      to: "alice@example.com",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty content", () => {
    const result = send.inputSchema.safeParse({ content: "" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid threadId", () => {
    const result = send.inputSchema.safeParse({
      content: "hello",
      threadId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid email in to", () => {
    const result = send.inputSchema.safeParse({
      content: "hello",
      to: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid email in cc", () => {
    const result = send.inputSchema.safeParse({
      cc: "not-an-email",
      content: "hello",
      to: "alice@example.com",
    });
    expect(result.success).toBe(false);
  });

  test("output schema expects threadId", () => {
    const result = send.outputSchema.safeParse({ threadId: "abc" });
    expect(result.success).toBe(true);
  });
});

// –
// Integration (requires Postgres)
// –

const HAS_DB = await hasDb();
let principalId: string;
let threadId: string;

beforeEach(async () => {
  if (!HAS_DB) return;
  await seedAccount();
  principalId = await seedPrincipal();
  threadId = await createThread(principalId);
});

afterEach(async () => {
  if (!HAS_DB) return;
  await cleanup();
});

/** Minimal ectx for chat-only sends (no email). */
function ectx(): OriginExecutionContext {
  return {
    contact: OWNER_CONTACT,
    contactFm: {},
    principal: {
      accountId: "99999999999999999999",
      credits: 1_000_000n,
      documents: [],
      id: principalId,
      name: "Test Pal",
      ownerEmail: "test@test.com",
      username: "test-pal",
    },
  };
}

describe.skipIf(!HAS_DB)("send (chat-only, integration)", () => {
  test("posts to an existing thread", async () => {
    const result = await send.call(ectx(), {
      content: "Hello from test",
      threadId,
    });

    expect(result.threadId).toBe(threadId);

    const rows = await db
      .select()
      .from(message)
      .where(eq(message.threadId, threadId));

    const msg = rows.find((r) => r.content === "Hello from test");
    expect(msg).toBeDefined();
    expect(msg!.role).toBe("assistant");
    expect(msg!.metadata).toBeNull();
  });

  test("creates a new thread when threadId omitted", async () => {
    const result = await send.call(ectx(), {
      content: "New thread message",
      subject: "Test Subject",
    });

    expect(result.threadId).toBeTruthy();
    expect(result.threadId).not.toBe(threadId);

    const rows = await db
      .select()
      .from(message)
      .where(eq(message.threadId, result.threadId));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.content).toBe("New thread message");
    expect(rows[0]!.metadata).toBeNull();
  });

  test("rejects send to a non-existent thread", async () => {
    await expect(
      send.call(ectx(), {
        content: "Should fail",
        threadId: "550e8400-e29b-41d4-a716-446655440099",
      }),
    ).rejects.toThrow(/not found/i);
  });
});
