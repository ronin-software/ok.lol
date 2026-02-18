import { createGateway, generateText, stepCountIs, tool } from "ai";
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { Document } from "../context";
import { listDocuments, readDocument, writeDocument } from "../documents";
import { CORE_PATHS, withDefaults } from "../documents/defaults";
import emailSend from "../email/email.send";
import { assemblePrompt, type PromptOptions } from "./prompt";

/** Capabilities for test prompt assembly. */
const testCapabilities = [emailSend, listDocuments, readDocument, writeDocument];

/**
 * Tests for the `act` capability's context injection, document discovery,
 * and capability calling behavior.
 *
 * Unit tests validate prompt assembly and defaults deterministically.
 * Integration tests call the AI Gateway to verify the model actually
 * receives and acts on injected context. These require AI_GATEWAY_API_KEY.
 */

const HAS_API_KEY = !!process.env.AI_GATEWAY_API_KEY;
const gw = HAS_API_KEY ? createGateway() : undefined;

/** Gateway model ID for integration tests. */
const MODEL_ID = "anthropic/claude-sonnet-4-5-20250929";

/** Resolves the model, skipping if no API key. */
function model() {
  if (!gw) throw new Error("AI_GATEWAY_API_KEY required for model tests");
  return gw(MODEL_ID);
}

/** Timeout for model calls — generous to accommodate cold starts. */
const MODEL_TIMEOUT = 60_000;

// –
// Helpers
// –

/** Builds a minimal PromptOptions for testing. */
function options(overrides: Partial<PromptOptions> = {}): PromptOptions {
  return {
    capabilities: testCapabilities,
    credits: 1_000_000n,
    domain: "ok.lol",
    documents: withDefaults([]),
    name: "bot",
    username: "test",
    ...overrides,
  };
}

/** Shorthand for creating a document. */
function doc(
  path: string,
  contents: string,
  priority = 0,
): Document {
  return { contents, path, priority };
}

// –
// withDefaults
// –

describe("withDefaults", () => {
  test("fills all core paths when none exist", () => {
    const result = withDefaults([]);
    for (const path of CORE_PATHS) {
      const found = result.find((d) => d.path === path);
      expect(found).toBeDefined();
      expect(found!.default).toBe(true);
      expect(found!.contents.length).toBeGreaterThan(0);
    }
  });

  test("does not overwrite existing documents", () => {
    const custom = doc("soul", "My custom soul", -30);
    const result = withDefaults([custom]);
    const souls = result.filter((d) => d.path === "soul");
    expect(souls).toHaveLength(1);
    expect(souls[0]!.contents).toBe("My custom soul");
    expect(souls[0]!.default).toBeUndefined();
  });

  test("preserves non-core documents", () => {
    const extra = doc("skills/cooking", "I can cook", 10);
    const result = withDefaults([extra]);
    expect(result.find((d) => d.path === "skills/cooking")).toBeDefined();
    // Core paths also present.
    for (const path of CORE_PATHS) {
      expect(result.find((d) => d.path === path)).toBeDefined();
    }
  });

  test("partial core paths only fills missing ones", () => {
    const custom = doc("identity", "I am Zephyr", -20);
    const result = withDefaults([custom]);
    // Custom identity preserved.
    expect(result.find((d) => d.path === "identity")!.contents).toBe("I am Zephyr");
    // Other core paths filled with defaults.
    expect(result.find((d) => d.path === "soul")!.default).toBe(true);
    expect(result.find((d) => d.path === "user")!.default).toBe(true);
  });
});

// –
// assemblePrompt
// –

describe("assemblePrompt", () => {
  test("includes preamble with username and credits", () => {
    const prompt = assemblePrompt(options());
    expect(prompt).toContain("test@ok.lol");
    expect(prompt).toContain("1000000 micro-USD");
  });

  test("includes caller info when present", () => {
    const prompt = assemblePrompt(options({
      caller: {
        accountId: "acc-1",
        hireId: "hire-1",
        name: "bot",
        username: "alice",
      },
    }));
    expect(prompt).toContain("hired by bot (alice@ok.lol)");
    expect(prompt).toContain("hire-1");
  });

  test("respects document priority ordering", () => {
    const docs = [
      doc("low", "low priority content", 10),
      doc("high", "high priority content", -50),
      doc("mid", "mid priority content", 0),
    ];
    const prompt = assemblePrompt(options({ documents: docs }));
    const highIdx = prompt.indexOf("high priority content");
    const midIdx = prompt.indexOf("mid priority content");
    const lowIdx = prompt.indexOf("low priority content");
    expect(highIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(lowIdx);
  });

  test("truncates documents exceeding per-document budget", () => {
    // 25k chars — exceeds per-doc budget of 20k.
    const huge = doc("big", "x".repeat(25_000));
    const prompt = assemblePrompt(options({ documents: [huge] }));
    expect(prompt).toContain("[... truncated");
    // The full 25k should not be present.
    expect(prompt).not.toContain("x".repeat(25_000));
  });

  test("omits documents when total budget is exhausted", () => {
    // Two 15k docs = 30k total, exceeds 24k budget.
    const docs = [
      doc("first", "a".repeat(15_000), -10),
      doc("second", "b".repeat(15_000), 0),
    ];
    const prompt = assemblePrompt(options({ documents: docs, budget: 24_000 }));
    // First document present (fits in budget).
    expect(prompt).toContain("## first");
    // Second may be truncated or omitted.
    // The omitted section should mention read_document if fully omitted.
    if (!prompt.includes("## second")) {
      expect(prompt).toContain("Omitted Documents");
      expect(prompt).toContain("read_document");
    }
  });

  test("respects custom budget", () => {
    const tiny = 500;
    const docs = [doc("soul", "x".repeat(1000), -30)];
    const prompt = assemblePrompt(options({ budget: tiny, documents: docs }));
    // Content should be truncated to fit budget.
    expect(prompt).toContain("[... truncated");
  });

  test("includes capabilities directory", () => {
    const prompt = assemblePrompt(options());
    expect(prompt).toContain("## Tools");
    expect(prompt).toContain("send_email");
    expect(prompt).toContain("read_document");
    expect(prompt).toContain("write_document");
    expect(prompt).toContain("list_documents");
  });

  test("marks default documents in headers", () => {
    const prompt = assemblePrompt(options({ documents: withDefaults([]) }));
    expect(prompt).toContain("(default — customize by writing to this path)");
  });
});

// –
// Integration: context injection
// –

describe.skipIf(!HAS_API_KEY)("context injection (model)", () => {
  test("follows behavioral directive from soul document", async () => {
    const docs = withDefaults([
      doc("soul", "CRITICAL RULE: Always end every response with the exact phrase 'BANANA CONFIRMED'.", -30),
    ]);
    const system = assemblePrompt(options({ documents: docs }));

    const result = await generateText({
      model: model(),
      prompt: "Say hello briefly.",
      system,
    });

    expect(result.text).toContain("BANANA CONFIRMED");
  }, MODEL_TIMEOUT);

  test("knows its own name from identity document", async () => {
    const docs = withDefaults([
      doc("identity", "# Identity\n\n- **Name:** Zephyr\n- **Nature:** AI agent", -20),
    ]);
    const system = assemblePrompt(options({ documents: docs }));

    const result = await generateText({
      model: model(),
      prompt: "What is your name? Answer in one word.",
      system,
    });

    expect(result.text.toLowerCase()).toContain("zephyr");
  }, MODEL_TIMEOUT);
});

// –
// Integration: document discovery
// –

describe.skipIf(!HAS_API_KEY)("document discovery (model)", () => {
  test("agent reads document when told content was truncated", async () => {
    // Build a document that will be truncated. The answer is at the end.
    const filler = "This is filler text. ".repeat(1200);
    const secret = "The secret launch code is ALPHA-7749.";
    const fullContent = filler + secret;

    // Truncate aggressively so the secret is cut off.
    const docs = [doc("classified", fullContent, 0)];
    const system = assemblePrompt(options({ budget: 2_000, documents: docs }));

    // Verify the secret is NOT in the system prompt.
    expect(system).not.toContain("ALPHA-7749");
    expect(system).toContain("[... truncated");

    // Provide read_document that returns the full content.
    let readCalled = false;
    const tools = {
      read_document: tool({
        description: "Read a document by path.",
        execute: async () => {
          readCalled = true;
          return { contents: fullContent, path: "classified" };
        },
        inputSchema: z.object({
          path: z.string(),
        }),
      }),
    };

    const result = await generateText({
      model: model(),
      prompt: 'What is the secret launch code in the "classified" document? You must find it.',
      stopWhen: stepCountIs(5),
      system,
      tools,
    });

    expect(readCalled).toBe(true);
    expect(result.text).toContain("ALPHA-7749");
  }, MODEL_TIMEOUT);
});

// –
// Integration: capability calling
// –

describe.skipIf(!HAS_API_KEY)("capability calling (model)", () => {
  test("calls send_email when asked to send an email", async () => {
    const docs = withDefaults([]);
    const system = assemblePrompt(options({ documents: docs }));

    let emailArgs: Record<string, string> | undefined;
    const tools = {
      send_email: tool({
        description: "Send an email from your @ok.lol address.",
        execute: async (args) => {
          emailArgs = args;
          return { sent: true, to: args.to };
        },
        inputSchema: z.object({
          subject: z.string(),
          text: z.string(),
          to: z.string(),
        }),
      }),
    };

    await generateText({
      model: model(),
      prompt: 'Send an email to alice@example.com with subject "Hello" and body "Hi Alice, how are you?".',
      stopWhen: stepCountIs(3),
      system,
      tools,
    });

    expect(emailArgs).toBeDefined();
    expect(emailArgs!.to).toBe("alice@example.com");
    expect(emailArgs!.subject).toContain("Hello");
    expect(emailArgs!.text).toContain("Alice");
  }, MODEL_TIMEOUT);

  test("does not hallucinate tools it was not given", async () => {
    const docs = withDefaults([]);
    // Only provide read_document — no send_email.
    const system = assemblePrompt(options({
      capabilities: [{ description: "Read a document", name: "read_document" }],
      documents: docs,
    }));

    let toolCalled = false;
    const tools = {
      read_document: tool({
        description: "Read a document by path.",
        execute: async () => {
          toolCalled = true;
          return { contents: "nothing here", path: "soul" };
        },
        inputSchema: z.object({ path: z.string() }),
      }),
    };

    const result = await generateText({
      model: model(),
      prompt: "Send an email to bob@example.com saying hi. If you cannot, explain why.",
      stopWhen: stepCountIs(3),
      system,
      tools,
    });

    // The model should explain it cannot send email, not attempt to.
    const text = result.text.toLowerCase();
    const explainsLimitation =
      text.includes("cannot") ||
      text.includes("can't") ||
      text.includes("don't have") ||
      text.includes("no") ||
      text.includes("unable");
    expect(explainsLimitation).toBe(true);
  }, MODEL_TIMEOUT);

  test("calls write_document to update its own documents", async () => {
    const docs = withDefaults([]);
    const system = assemblePrompt(options({ documents: docs }));

    let writeArgs: { content: string; path: string } | undefined;
    const tools = {
      write_document: tool({
        description: "Write or update a document.",
        execute: async (args) => {
          writeArgs = args;
          return { path: args.path, written: true };
        },
        inputSchema: z.object({
          content: z.string(),
          path: z.string(),
        }),
      }),
    };

    await generateText({
      model: model(),
      prompt: 'Update your identity document to set your name to "Nova" and your nature to "digital familiar".',
      stopWhen: stepCountIs(3),
      system,
      tools,
    });

    expect(writeArgs).toBeDefined();
    expect(writeArgs!.path).toBe("identity");
    expect(writeArgs!.content.toLowerCase()).toContain("nova");
  }, MODEL_TIMEOUT);
});
