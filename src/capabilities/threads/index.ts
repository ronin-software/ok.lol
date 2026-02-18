/**
 * Thread capabilities — list, search, read, expand, and follow up.
 *
 * These give the principal memory: it can browse conversations,
 * search across threads, read active context, drill into summaries,
 * and post follow-up messages to threads it owns.
 */

import { findOwnerContact } from "@/db/contacts";
import {
  activeContext,
  children as childrenOf,
  expand as expandTree,
  getThreadMeta,
  insertMessage,
  recentThreads,
  searchMessages,
} from "@/db/threads";
import { assert } from "@/lib/assert";
import type { Capability } from "@ok.lol/capability";
import { z } from "zod";
import type { OriginExecutionContext } from "../_execution-context";
import emailSend from "../email/email.send";

// –
// List
// –

const listInput = z.object({
  channel: z.enum(["chat", "email"]).optional().describe("Filter by channel"),
  limit: z.number().int().min(1).max(50).optional().describe("Max results (default 20)"),
});

const listOutput = z.object({
  threads: z.array(z.object({
    channel: z.string(),
    id: z.string(),
    snippet: z.string().nullable(),
    snippetAt: z.string().nullable(),
    title: z.string().nullable(),
  })),
});

type ListInput = z.infer<typeof listInput>;
type ListOutput = z.infer<typeof listOutput>;

export const listThreads: Capability<OriginExecutionContext, ListInput, ListOutput> = {
  available: async () => true,
  async call(ectx, input) {
    const rows = await recentThreads(ectx.principal.id, {
      channel: input.channel,
      limit: input.limit,
    });

    return {
      threads: rows.map((r) => ({
        channel: r.channel,
        id: r.id,
        snippet: r.snippet ? r.snippet.slice(0, 120) : null,
        snippetAt: r.snippetAt?.toISOString() ?? null,
        title: r.title,
      })),
    };
  },
  setup: async () => {},

  description: "List recent conversation threads with latest snippet",
  name: "list_threads",

  inputSchema: listInput,
  outputSchema: listOutput,
};

// –
// Search
// –

const searchInput = z.object({
  limit: z.number().int().min(1).max(50).optional().describe("Max results (default 20)"),
  query: z.string().min(1).describe("Text to search for in messages"),
});

const searchOutput = z.object({
  results: z.array(z.object({
    content: z.string(),
    id: z.string(),
    role: z.string(),
    threadId: z.string(),
    threadTitle: z.string().nullable(),
  })),
});

type SearchInput = z.infer<typeof searchInput>;
type SearchOutput = z.infer<typeof searchOutput>;

export const searchThreads: Capability<OriginExecutionContext, SearchInput, SearchOutput> = {
  available: async () => true,
  async call(ectx, input) {
    assert(input.query.length > 0, "query must be non-empty");

    const rows = await searchMessages(
      ectx.principal.id,
      input.query,
      input.limit,
    );

    return {
      results: rows.map((r) => ({
        content: r.content.slice(0, 200),
        id: r.id,
        role: r.role,
        threadId: r.threadId,
        threadTitle: r.threadTitle,
      })),
    };
  },
  setup: async () => {},

  description: "Search message content across all your threads",
  name: "search_threads",

  inputSchema: searchInput,
  outputSchema: searchOutput,
};

// –
// Read
// –

const readInput = z.object({
  threadId: z.string().uuid().describe("Thread ID to read"),
});

const readOutput = z.object({
  messages: z.array(z.object({
    content: z.string(),
    createdAt: z.string(),
    id: z.string(),
    role: z.string(),
    tokens: z.number().nullable(),
  })),
});

type ReadInput = z.infer<typeof readInput>;
type ReadOutput = z.infer<typeof readOutput>;

export const readThread: Capability<OriginExecutionContext, ReadInput, ReadOutput> = {
  available: async () => true,
  async call(_ectx, input) {
    const rows = await activeContext(input.threadId);

    return {
      messages: rows.map((r) => ({
        content: r.content,
        createdAt: r.createdAt.toISOString(),
        id: r.id,
        role: r.role,
        tokens: r.tokens,
      })),
    };
  },
  setup: async () => {},

  description: "Read the active context of a thread (summaries + unsummarized messages)",
  name: "read_thread",

  inputSchema: readInput,
  outputSchema: readOutput,
};

// –
// Expand
// –

const expandInput = z.object({
  recursive: z.boolean().optional().describe("Expand all the way to leaf messages (default false)"),
  summaryId: z.string().uuid().describe("Summary message ID to expand"),
});

const expandOutput = z.object({
  messages: z.array(z.object({
    content: z.string(),
    createdAt: z.string(),
    id: z.string(),
    role: z.string(),
  })),
});

type ExpandInput = z.infer<typeof expandInput>;
type ExpandOutput = z.infer<typeof expandOutput>;

export const expandSummary: Capability<OriginExecutionContext, ExpandInput, ExpandOutput> = {
  available: async () => true,
  async call(_ectx, input) {
    const rows = input.recursive
      ? await expandTree(input.summaryId)
      : await childrenOf(input.summaryId);

    return {
      messages: rows.map((r) => ({
        content: r.content,
        createdAt: r.createdAt.toISOString(),
        id: r.id,
        role: r.role,
      })),
    };
  },
  setup: async () => {},

  description: "Expand a summary into its children (or recursively to leaf messages)",
  name: "expand",

  inputSchema: expandInput,
  outputSchema: expandOutput,
};

// –
// Follow up
// –

const followUpInput = z.object({
  content: z.string().min(1).describe("Message to post"),
  threadId: z.string().uuid().describe("Thread to post in"),
});

type FollowUpInput = z.infer<typeof followUpInput>;

/** Post a message in a thread you're not currently acting in. */
export const followUp: Capability<OriginExecutionContext, FollowUpInput, void> = {
  available: async () => true,
  async call(ectx, input) {
    const meta = await getThreadMeta(input.threadId, ectx.principal.id);
    assert(meta != null, `Thread not found or not owned: ${input.threadId}`);

    if (meta.channel === "email") {
      // Email threads require an actual send so the owner sees it in their inbox.
      const owner = await findOwnerContact(ectx.principal.id);
      assert(owner?.email != null, "Owner contact email not set");
      await emailSend.call(ectx, {
        subject: meta.title ? `Re: ${meta.title}` : "Follow-up",
        text: input.content,
        threadId: input.threadId,
        to: owner.email,
      });
    } else {
      // Chat (and any future in-app channel): write directly to the thread.
      await insertMessage({
        content: input.content,
        principalId: ectx.principal.id,
        role: "assistant",
        threadId: input.threadId,
      });
    }
  },
  setup: async () => {},

  description:
    "Post a message in another thread. Use when a thread is waiting " +
    "for information you now have — not to duplicate what the user already knows.",
  name: "follow_up",

  inputSchema: followUpInput,
  outputSchema: z.void(),
};
