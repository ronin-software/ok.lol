import { createGateway, generateText, stepCountIs, tool } from "ai";
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { withDefaults } from "../documents/defaults";
import { assemblePrompt } from "../act/prompt";
import emailSend from "../email/email.send";
import { followUp, listThreads, searchThreads } from "./index";

/**
 * Tests for the `followUp` capability and the model's ability to use it.
 *
 * Unit tests validate schema and metadata without a DB.
 * Integration tests use the AI Gateway to verify the model correctly
 * identifies threads waiting for information and posts follow-ups.
 * These require AI_GATEWAY_API_KEY.
 */

const HAS_API_KEY = !!process.env.AI_GATEWAY_API_KEY;
const gw = HAS_API_KEY ? createGateway() : undefined;

const MODEL_ID = "anthropic/claude-sonnet-4-5-20250929";
const MODEL_TIMEOUT = 60_000;

function model() {
  if (!gw) throw new Error("AI_GATEWAY_API_KEY required for model tests");
  return gw(MODEL_ID);
}

/** System prompt matching the origin toolset available during email-receive. */
function systemWithFollowUp() {
  return assemblePrompt({
    capabilities: [emailSend, followUp, listThreads, searchThreads],
    credits: 1_000_000n,
    domain: "ok.lol",
    documents: withDefaults([]),
    name: "bot",
    username: "test",
  });
}

/** The email-receive prompt, mirroring email.receive.ts exactly. */
function emailReceivePrompt(from: string, subject: string, body: string) {
  return [
    "You received an email. Read it carefully and decide how to handle it.",
    "Be mindful of whether the email was sent by me or by someone else.",
    "",
    "To notify me of something, prefer follow_up over email — search your threads first.",
    "If you can identify a thread where I asked you to do something related to this email",
    "(e.g. 'email X and let me know when they reply'), use follow_up to post there.",
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

describe("followUp capability", () => {
  test("has correct name and description", () => {
    expect(followUp.name).toBe("follow_up");
    expect(followUp.description).toContain("thread");
    expect(followUp.description).toContain("waiting");
  });

  test("input schema requires threadId and content", () => {
    const valid = followUp.inputSchema.safeParse({
      content: "hello",
      threadId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(valid.success).toBe(true);
  });

  test("input schema rejects empty content", () => {
    const result = followUp.inputSchema.safeParse({
      content: "",
      threadId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });

  test("input schema rejects non-UUID threadId", () => {
    const result = followUp.inputSchema.safeParse({
      content: "hello",
      threadId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

// –
// Integration: follow-up behavior (model)
// –

describe.skipIf(!HAS_API_KEY)("follow-up behavior (model)", () => {
  test("posts to the waiting thread when an email reply arrives", async () => {
    const system = systemWithFollowUp();

    const chatThreadId = "550e8400-e29b-41d4-a716-446655440001";
    let followUpArgs: { content: string; threadId: string } | undefined;
    let emailCalled = false;

    const tools = {
      follow_up: tool({
        description: followUp.description,
        execute: async (args) => { followUpArgs = args; },
        inputSchema: z.object({ content: z.string(), threadId: z.string() }),
      }),
      list_threads: tool({
        description: listThreads.description,
        execute: async () => ({
          threads: [{
            channel: "chat",
            id: chatThreadId,
            snippet: "Email Alice about the contract proposal and let me know when she replies",
            snippetAt: new Date(Date.now() - 3600_000).toISOString(),
            title: "Contract follow-up",
          }],
        }),
        inputSchema: z.object({
          channel: z.enum(["chat", "email"]).optional(),
          limit: z.number().optional(),
        }),
      }),
      search_threads: tool({
        description: searchThreads.description,
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
      send_email: tool({
        description: emailSend.description,
        execute: async () => { emailCalled = true; },
        inputSchema: z.object({
          subject: z.string(),
          text: z.string(),
          to: z.string(),
        }),
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
    expect(followUpArgs).toBeDefined();
    expect(followUpArgs!.threadId).toBe(chatThreadId);
    expect(followUpArgs!.content.toLowerCase()).toMatch(/alice|contract|replied|responded/);
    expect(emailCalled).toBe(false);
  }, MODEL_TIMEOUT);

  test("does not follow up when user directly asks about an email reply", async () => {
    // The user is asking in their current thread — the answer goes here directly.
    // No other thread is "waiting"; the user already initiated the question.
    const system = systemWithFollowUp();

    let followUpCalled = false;

    const tools = {
      follow_up: tool({
        description: followUp.description,
        execute: async () => { followUpCalled = true; },
        inputSchema: z.object({ content: z.string(), threadId: z.string() }),
      }),
      list_threads: tool({
        description: listThreads.description,
        execute: async () => ({
          threads: [{
            channel: "email",
            id: "550e8400-e29b-41d4-a716-446655440002",
            snippet: "Hi, I've reviewed the contract and I'm happy to move forward.",
            snippetAt: new Date(Date.now() - 600_000).toISOString(),
            title: "Re: Contract Proposal",
          }],
        }),
        inputSchema: z.object({
          channel: z.enum(["chat", "email"]).optional(),
          limit: z.number().optional(),
        }),
      }),
      search_threads: tool({
        description: searchThreads.description,
        execute: async () => ({ results: [] }),
        inputSchema: z.object({ limit: z.number().optional(), query: z.string() }),
      }),
    };

    // User is asking directly — this is the current thread, answer goes here.
    const result = await generateText({
      model: model(),
      prompt: "Did Alice reply to the contract email?",
      stopWhen: stepCountIs(5),
      system,
      tools,
    });

    expect(followUpCalled).toBe(false);
    expect(result.text.toLowerCase()).toMatch(/alice|contract|replied|yes/);
  }, MODEL_TIMEOUT);
});
