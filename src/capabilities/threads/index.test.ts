/**
 * Tests for thread capabilities and the model's ability to use `send`.
 *
 * Unit tests validate schema and metadata without a DB.
 * Integration tests use the AI Gateway to verify the model correctly
 * identifies threads and posts messages via `send`.
 * These require AI_GATEWAY_API_KEY.
 */

import { createGateway, generateText, stepCountIs, tool } from "ai";
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { withDefaults } from "../documents/defaults";
import { assemblePrompt } from "../act/prompt";
import send from "../send";
import { threadList, threadSearch } from "./index";

const HAS_API_KEY = !!process.env.AI_GATEWAY_API_KEY;
const gw = HAS_API_KEY ? createGateway() : undefined;

const MODEL_ID = "anthropic/claude-sonnet-4-5-20250929";
const MODEL_TIMEOUT = 60_000;

function model() {
  if (!gw) throw new Error("AI_GATEWAY_API_KEY required for model tests");
  return gw(MODEL_ID);
}

/** System prompt matching the origin toolset. */
function systemWithSend() {
  return assemblePrompt({
    capabilities: [send, threadList, threadSearch],
    contact: { identifier: "USER", isOwner: true, tags: [] },
    contactFm: {},
    credits: 1_000_000n,
    domain: "ok.lol",
    documents: withDefaults([]),
    name: "bot",
    username: "test",
  });
}

/** Simulated inbound-email prompt. */
function emailReceivePrompt(from: string, subject: string, body: string) {
  return [
    "You received an email. Read it carefully and decide how to handle it.",
    "Be mindful of whether the email was sent by me or by someone else.",
    "",
    "To notify me of something, prefer posting to an existing thread — search your threads first.",
    "If you can identify a thread where I asked you to do something related to this email",
    '(e.g. "email X and let me know when they reply"), use send to post there.',
    "Only fall back to emailing me if no relevant thread exists.",
    "",
    "If the email is from someone else and warrants a reply, reply to them directly.",
    "If it's from me, handle it as a task or message — no need to reply by email.",
    "",
    `From: ${from}`,
    `Subject: ${subject}`,
    "",
    body,
  ].join("\n");
}

// –
// Unit
// –

describe("send capability", () => {
  test("has correct name and description", () => {
    expect(send.name).toBe("send");
    expect(send.description).toBeTruthy();
  });

  test("input schema accepts threadId + content", () => {
    const valid = send.inputSchema.safeParse({
      content: "hello",
      threadId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(valid.success).toBe(true);
  });

  test("input schema rejects empty content", () => {
    const result = send.inputSchema.safeParse({
      content: "",
      threadId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });

  test("input schema rejects non-UUID threadId", () => {
    const result = send.inputSchema.safeParse({
      content: "hello",
      threadId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

// –
// Integration: send behavior (model)
// –

describe.skipIf(!HAS_API_KEY)("send behavior (model)", () => {
  test("posts to the waiting thread when an email reply arrives", async () => {
    const system = systemWithSend();

    const chatThreadId = "550e8400-e29b-41d4-a716-446655440001";
    let sendArgs: Record<string, unknown> | undefined;

    const tools = {
      send: tool({
        description: send.description,
        execute: async (args) => { sendArgs = args; return { threadId: args.threadId ?? chatThreadId }; },
        inputSchema: z.object({
          content: z.string(),
          subject: z.string().optional(),
          threadId: z.string().optional(),
          to: z.string().optional(),
        }),
      }),
      thread_list: tool({
        description: threadList.description,
        execute: async () => ({
          threads: [{
            id: chatThreadId,
            snippet: "Email Alice about the contract proposal and let me know when she replies",
            snippetAt: new Date(Date.now() - 3600_000).toISOString(),
            title: "Contract follow-up",
          }],
        }),
        inputSchema: z.object({
          limit: z.number().optional(),
          scope: z.enum(["mine", "others"]).optional(),
        }),
      }),
      thread_search: tool({
        description: threadSearch.description,
        execute: async () => ({
          results: [{
            content: "Email Alice about the contract proposal and let me know when she replies",
            id: "msg-1",
            role: "user",
            threadId: chatThreadId,
            threadTitle: "Contract follow-up",
          }],
        }),
        inputSchema: z.object({ limit: z.number().optional(), query: z.string() }),
      }),
    };

    await generateText({
      model: model(),
      prompt: emailReceivePrompt(
        "alice@example.com",
        "Re: Contract Proposal",
        "Hi, thanks for sending that over. I've reviewed it and I'm happy to move forward.",
      ),
      stopWhen: stepCountIs(5),
      system,
      tools,
    });

    // Should post in the waiting thread, not email the user.
    expect(sendArgs).toBeDefined();
    expect(sendArgs!.threadId).toBe(chatThreadId);
    expect((sendArgs!.content as string).toLowerCase()).toMatch(/alice|contract|replied|responded|forward/);
    expect(sendArgs!.to).toBeUndefined();
  }, MODEL_TIMEOUT);

  test("does not send when user directly asks about an email reply", async () => {
    const system = systemWithSend();

    let sendCalled = false;

    const tools = {
      send: tool({
        description: send.description,
        execute: async () => { sendCalled = true; return { threadId: "x" }; },
        inputSchema: z.object({
          content: z.string(),
          subject: z.string().optional(),
          threadId: z.string().optional(),
          to: z.string().optional(),
        }),
      }),
      thread_list: tool({
        description: threadList.description,
        execute: async () => ({
          threads: [{
            id: "550e8400-e29b-41d4-a716-446655440002",
            snippet: "Hi, I've reviewed the contract and I'm happy to move forward.",
            snippetAt: new Date(Date.now() - 600_000).toISOString(),
            title: "Re: Contract Proposal",
          }],
        }),
        inputSchema: z.object({
          limit: z.number().optional(),
          scope: z.enum(["mine", "others"]).optional(),
        }),
      }),
      thread_search: tool({
        description: threadSearch.description,
        execute: async () => ({ results: [] }),
        inputSchema: z.object({ limit: z.number().optional(), query: z.string() }),
      }),
    };

    const result = await generateText({
      model: model(),
      prompt: "Did Alice reply to the contract email?",
      stopWhen: stepCountIs(5),
      system,
      tools,
    });

    expect(sendCalled).toBe(false);
    expect(result.text.toLowerCase()).toMatch(/alice|contract|replied|yes/);
  }, MODEL_TIMEOUT);
});
