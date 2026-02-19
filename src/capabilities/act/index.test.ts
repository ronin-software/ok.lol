import { createGateway, generateText, stepCountIs, tool } from "ai";
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { CapabilitySpec } from "@ok.lol/capability";
import type { Document } from "../context";
import {
  contactLookup,
  contactLookupOwner,
  contactRecord,
  contactSearch,
} from "../contacts";
import { documentList, documentRead, documentWrite } from "../documents";
import { CORE_PATHS, withDefaults } from "../documents/defaults";
import emailSend from "../email/email.send";
import {
  followUp,
  threadList,
  threadRead,
  threadSearch,
  threadSummaryExpand,
} from "../threads";
import { assemblePrompt, type PromptOptions } from "./prompt";

/** All origin capabilities for realistic test prompts. */
const allCapabilities: CapabilitySpec[] = [
  contactLookup,
  contactLookupOwner,
  contactRecord,
  contactSearch,
  documentList,
  documentRead,
  documentWrite,
  emailSend,
  followUp,
  threadList,
  threadRead,
  threadSearch,
  threadSummaryExpand,
];

/** Minimal subset for backward-compatible tests. */
const testCapabilities: CapabilitySpec[] = [emailSend, documentList, documentRead, documentWrite];

/**
 * Tests for the `act` capability's context injection, document discovery,
 * and capability calling behavior.
 *
 * Unit tests validate prompt assembly and defaults deterministically.
 * Integration tests call the AI Gateway to verify the model actually
 * receives and acts on injected context. These require AI_GATEWAY_API_KEY.
 *
 * Multi-step agentic tests (tool round-trips, large contexts) are gated
 * behind RUN_EXPENSIVE_TESTS=1 to avoid burning credits on every run.
 */

const HAS_API_KEY = !!process.env.AI_GATEWAY_API_KEY;
const EXPENSIVE = HAS_API_KEY && !!process.env.RUN_EXPENSIVE_TESTS;
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

  test("injects tool docs for available capabilities", () => {
    const caps: CapabilitySpec[] = [
      { description: "Send email", name: "email_send" },
      { description: "Look up contact", name: "contact_lookup" },
    ];
    const result = withDefaults([], caps);
    const emailDoc = result.find((d) => d.path === "tools/email_send");
    expect(emailDoc).toBeDefined();
    expect(emailDoc!.default).toBe(true);
    expect(emailDoc!.contents).toContain("Prerequisites");
    const contactDoc = result.find((d) => d.path === "tools/contact_lookup");
    expect(contactDoc).toBeDefined();
    expect(contactDoc!.contents).toContain("trust level");
  });

  test("does not inject tool docs for capabilities without templates", () => {
    const caps: CapabilitySpec[] = [
      { description: "Some unknown tool", name: "unknown_tool_xyz" },
    ];
    const result = withDefaults([], caps);
    expect(result.find((d) => d.path === "tools/unknown_tool_xyz")).toBeUndefined();
  });

  test("principal override replaces tool doc default", () => {
    const caps: CapabilitySpec[] = [
      { description: "Send email", name: "email_send" },
    ];
    const custom = doc("tools/email_send", "My custom email guide");
    const result = withDefaults([custom], caps);
    const emailDocs = result.filter((d) => d.path === "tools/email_send");
    expect(emailDocs).toHaveLength(1);
    expect(emailDocs[0]!.contents).toBe("My custom email guide");
    expect(emailDocs[0]!.default).toBeUndefined();
  });

  test("omits tool docs when no capabilities provided", () => {
    const result = withDefaults([]);
    const toolDocs = result.filter((d) => d.path.startsWith("tools/"));
    expect(toolDocs).toHaveLength(0);
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
    // The omitted section should mention document_read if fully omitted.
    if (!prompt.includes("## second")) {
      expect(prompt).toContain("Omitted Documents");
      expect(prompt).toContain("document_read");
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
    expect(prompt).toContain("email_send");
    expect(prompt).toContain("document_read");
    expect(prompt).toContain("document_write");
    expect(prompt).toContain("document_list");
  });

  test("marks default documents in headers", () => {
    const prompt = assemblePrompt(options({ documents: withDefaults([]) }));
    expect(prompt).toContain("(default — customize by writing to this path)");
  });

  test("injects context section when provided", () => {
    const prompt = assemblePrompt(options({
      context: "### Recent threads\n- [chat] Project planning: let's discuss...",
    }));
    expect(prompt).toContain("## Context");
    expect(prompt).toContain("Project planning");
  });

  test("omits context section when absent", () => {
    // Use docs without "## Context" in their body to avoid false matches.
    const prompt = assemblePrompt(options({
      documents: [doc("soul", "Be helpful", -30)],
    }));
    expect(prompt).not.toContain("## Context");
  });

  test("includes worker preamble when worker tools present", () => {
    const caps: CapabilitySpec[] = [
      ...testCapabilities,
      { description: "[worker: macbook] Run a shell command", name: "macbook_bash" },
    ];
    const prompt = assemblePrompt(options({ capabilities: caps }));
    expect(prompt).toContain("Workers are computers you can control remotely");
  });

  test("omits worker preamble when no workers", () => {
    const prompt = assemblePrompt(options());
    expect(prompt).not.toContain("Workers are computers you can control remotely");
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

describe.skipIf(!EXPENSIVE)("document discovery (model)", () => {
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

    // Provide document_read that returns the full content.
    let readCalled = false;
    const tools = {
      document_read: tool({
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

describe.skipIf(!EXPENSIVE)("capability calling (model)", () => {
  test("calls email_send when asked to send an email", async () => {
    const docs = withDefaults([]);
    const system = assemblePrompt(options({ documents: docs }));

    let emailArgs: Record<string, string> | undefined;
    const tools = {
      email_send: tool({
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
    // Only provide document_read — no email_send.
    const system = assemblePrompt(options({
      capabilities: [{ description: "Read a document", name: "document_read" }],
      documents: docs,
    }));

    let toolCalled = false;
    const tools = {
      document_read: tool({
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

  test("calls document_write to update its own documents", async () => {
    const docs = withDefaults([]);
    const system = assemblePrompt(options({ documents: docs }));

    let writeArgs: { content: string; path: string } | undefined;
    const tools = {
      document_write: tool({
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

// –
// Integration: contact lookup before send
// –

describe.skipIf(!EXPENSIVE)("contact lookup before send (model)", () => {
  test("looks up contact before sending email", async () => {
    const docs = withDefaults([], allCapabilities);
    const system = assemblePrompt(options({
      capabilities: allCapabilities,
      documents: docs,
    }));

    const calls: string[] = [];
    const tools = {
      contact_lookup: tool({
        description: "Look up a contact by email.",
        execute: async (args) => {
          calls.push("contact_lookup");
          return {
            isOwner: false,
            name: "Alice",
            notesPath: `contacts/${args.email}`,
            relationship: "contact",
          };
        },
        inputSchema: z.object({ email: z.string() }),
      }),
      contact_search: tool({
        description: "Search contacts by name or email.",
        execute: async () => {
          calls.push("contact_search");
          return [{ email: "alice@example.com", name: "Alice", relationship: "contact" }];
        },
        inputSchema: z.object({ query: z.string() }),
      }),
      email_send: tool({
        description: "Send an email.",
        execute: async () => {
          calls.push("email_send");
          return { sent: true };
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
      prompt: "Email alice@example.com to ask about the project deadline.",
      stopWhen: stepCountIs(5),
      system,
      tools,
    });

    // Contact lookup/search should precede email_send.
    const lookupIdx = calls.findIndex((c) => c === "contact_lookup" || c === "contact_search");
    const sendIdx = calls.findIndex((c) => c === "email_send");
    expect(lookupIdx).toBeGreaterThanOrEqual(0);
    expect(sendIdx).toBeGreaterThan(lookupIdx);
  }, MODEL_TIMEOUT);
});

// –
// Integration: follow-up thread selection
// –

describe.skipIf(!EXPENSIVE)("follow-up thread selection (model)", () => {
  test("follows up in existing thread instead of emailing owner", async () => {
    const docs = withDefaults([], allCapabilities);
    const system = assemblePrompt(options({
      capabilities: allCapabilities,
      context: "### Other threads with alice@example.com\n- Email Alice about deadline: waiting for reply",
      documents: docs,
    }));

    const calls: string[] = [];
    const tools = {
      contact_lookup: tool({
        description: "Look up a contact by email.",
        execute: async () => {
          calls.push("contact_lookup");
          return { isOwner: false, name: "Alice", notesPath: "contacts/alice@example.com", relationship: "contact" };
        },
        inputSchema: z.object({ email: z.string() }),
      }),
      email_send: tool({
        description: "Send an email.",
        execute: async () => { calls.push("email_send"); return { sent: true }; },
        inputSchema: z.object({ subject: z.string(), text: z.string(), to: z.string() }),
      }),
      follow_up: tool({
        description: "Post a message in another thread.",
        execute: async () => { calls.push("follow_up"); },
        inputSchema: z.object({ content: z.string(), threadId: z.string() }),
      }),
      thread_list: tool({
        description: "List recent threads.",
        execute: async () => {
          calls.push("thread_list");
          return {
            threads: [{
              channel: "chat",
              id: "thread-abc",
              snippet: "Email Alice about the deadline and let me know when she replies",
              snippetAt: new Date().toISOString(),
              title: "Email Alice about deadline",
            }],
          };
        },
        inputSchema: z.object({ channel: z.string().optional(), limit: z.number().optional() }),
      }),
      thread_search: tool({
        description: "Search threads by content.",
        execute: async () => {
          calls.push("thread_search");
          return {
            results: [{
              content: "Email Alice about the deadline and let me know when she replies",
              id: "msg-1",
              role: "user",
              threadId: "thread-abc",
              threadTitle: "Email Alice about deadline",
            }],
          };
        },
        inputSchema: z.object({ limit: z.number().optional(), query: z.string() }),
      }),
    };

    await generateText({
      model: model(),
      prompt: [
        "You received an email reply from Alice (alice@example.com).",
        "She says the deadline is next Friday.",
        "Your owner previously asked you to email Alice and report back.",
        "Handle this appropriately.",
      ].join("\n"),
      stopWhen: stepCountIs(8),
      system,
      tools,
    });

    // Should use follow_up (or thread_search/thread_list to find the thread).
    expect(calls).toContain("follow_up");
  }, MODEL_TIMEOUT);
});

// –
// Integration: cross-thread context prevents rehashing
// –

describe.skipIf(!EXPENSIVE)("cross-thread context (model)", () => {
  test("references prior interactions instead of starting fresh", async () => {
    const docs = withDefaults([], allCapabilities);
    const system = assemblePrompt(options({
      capabilities: allCapabilities,
      context: [
        "### Other threads with bob@example.com",
        "- Project kickoff: Discussed timeline, agreed on March 1 launch date",
        "- Budget review: Bob approved $50k budget, waiting on PO",
      ].join("\n"),
      documents: docs,
    }));

    const tools = {
      contact_lookup: tool({
        description: "Look up a contact by email.",
        execute: async () => ({
          isOwner: false,
          name: "Bob",
          notesPath: "contacts/bob@example.com",
          relationship: "contact",
        }),
        inputSchema: z.object({ email: z.string() }),
      }),
      email_send: tool({
        description: "Send an email.",
        execute: async () => ({ sent: true }),
        inputSchema: z.object({ subject: z.string(), text: z.string(), to: z.string() }),
      }),
    };

    const result = await generateText({
      model: model(),
      prompt: [
        "You received an email from Bob (bob@example.com) asking 'Any updates on the project?'",
        "Reply to Bob with an appropriate response.",
      ].join("\n"),
      stopWhen: stepCountIs(5),
      system,
      tools,
    });

    // The response should reference the prior context, not start from scratch.
    const text = result.text.toLowerCase();
    const referencesContext =
      text.includes("march") ||
      text.includes("timeline") ||
      text.includes("budget") ||
      text.includes("launch") ||
      text.includes("50k") ||
      text.includes("po");
    expect(referencesContext).toBe(true);
  }, MODEL_TIMEOUT);
});

// –
// Integration: worker capability usage
// –

describe.skipIf(!EXPENSIVE)("worker capability (model)", () => {
  test("calls worker tool when task requires it", async () => {
    const workerCap: CapabilitySpec = {
      description: "[worker: macbook] Run a shell command on the user's computer",
      name: "macbook_bash",
    };
    const caps = [...allCapabilities, workerCap];
    const docs = withDefaults([], caps);
    const system = assemblePrompt(options({
      capabilities: caps,
      documents: docs,
    }));

    let workerCalled = false;
    const tools = {
      macbook_bash: tool({
        description: "[worker: macbook] Run a shell command on the user's computer",
        execute: async () => {
          workerCalled = true;
          return { output: "total 42\ndrwxr-xr-x  5 user  staff  160 Jan  1 00:00 Documents", exitCode: 0 };
        },
        inputSchema: z.object({ command: z.string() }),
      }),
    };

    await generateText({
      model: model(),
      prompt: "List the files in my home directory.",
      stopWhen: stepCountIs(5),
      system,
      tools,
    });

    expect(workerCalled).toBe(true);
  }, MODEL_TIMEOUT);
});
