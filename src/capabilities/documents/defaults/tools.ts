/**
 * Tool document templates — procedural guidance injected per-capability.
 *
 * Each template carries the tool's usage guidance, prerequisites, and
 * patterns. Principals override by writing to `tools/{name}`.
 */

import type { Activation } from "../../context";

/** Default doc for a tool: contents, priority, and optional activation. */
export type ToolTemplate = {
  activation?: Activation;
  contents: string;
  priority: number;
};

/**
 * Rich guidance per tool, keyed by capability name.
 *
 * The ## Tools section stays terse (name + description). These docs
 * carry procedural knowledge: prerequisites, do's/don'ts, patterns.
 */
export const toolTemplates: Record<string, ToolTemplate> = {
  document_list: {
    activation: {
      positive: ["what documents do I have", "list documents", "browse documents"],
      negative: ["send email", "search threads"],
    },
    contents:
      "List all your document paths. Use to discover what you've written. " +
      "Documents are your persistent memory — browse them to orient yourself.",
    priority: 10,
  },

  document_read: {
    activation: {
      positive: ["read document", "load document", "check notes", "truncated"],
      negative: ["send email", "list contacts"],
    },
    contents:
      "Read a document by path. Use to load full content — especially when a document " +
      "was truncated in your context. Also useful for loading contact notes at `contacts/{identifier}.md`.",
    priority: 10,
  },

  document_write: {
    activation: {
      positive: ["save notes", "update document", "write document", "remember this"],
      negative: ["send email", "search threads"],
    },
    contents:
      "Write or update a document. Creates a new version (append-only). " +
      "Use for persisting knowledge, preferences, and notes. " +
      "You can customize your own tool guides (for example, with learnings, difficulties encountered, wishes or DO's/DONT's) by writing to `tools/{name}.md`.",
    priority: 10,
  },

  send: {
    activation: {
      positive: ["send message", "send email", "reply", "follow up", "post in thread", "notify"],
      negative: ["read document", "fetch URL"],
    },
    contents:
      "Post a message in a thread, optionally delivering via email.\n\n" +
      "- **Chat only:** omit `to` — the message is posted in-thread. " +
      "Use when a thread is waiting for information you now have.\n" +
      "- **Email:** set `to` to an email address or `\"owner\"`. " +
      "Always check `contacts/{identifier}.md` first to verify the recipient.\n" +
      "- **New thread:** omit `threadId` to start a new conversation.\n\n" +
      "Always pass `threadId` when acting within an existing thread.",
    priority: 10,
  },

  http_get: {
    activation: {
      positive: ["fetch URL", "get webpage", "HTTP request", "download page"],
      negative: ["send email", "search contacts"],
    },
    contents:
      "Fetch a public URL via HTTP GET. Returns body (up to 64 KB) and status. " +
      "Only http/https allowed. No private/local addresses. 10s timeout.",
    priority: 10,
  },

  thread_list: {
    activation: {
      positive: ["recent threads", "list conversations", "what threads exist", "browse threads"],
      negative: ["send email", "write document"],
    },
    contents:
      "List recent threads with latest snippet. Filter by scope (mine/others). " +
      "Use to get situational awareness before acting — especially on async events like incoming email.",
    priority: 10,
  },

  thread_read: {
    activation: {
      positive: ["read thread", "thread context", "what was said", "conversation history"],
      negative: ["write document", "fetch URL"],
    },
    contents:
      "Read a thread's active context (summaries + unsummarized messages). " +
      "Use to understand what happened in a conversation before responding or following up.",
    priority: 10,
  },

  thread_search: {
    activation: {
      positive: ["search threads", "find conversation", "search messages", "look for thread"],
      negative: ["write document", "fetch URL"],
    },
    contents:
      "Search across all your threads by message content. " +
      "Use to find related conversations — essential before using send to post in the right thread.",
    priority: 10,
  },

  thread_summary_expand: {
    activation: {
      positive: ["expand summary", "drill into summary", "see original messages"],
      negative: ["send email", "search contacts"],
    },
    contents:
      "Expand a summary message into its children. Use `recursive: true` to drill all the way " +
      "to leaf messages. Useful when a summary doesn't have enough detail.",
    priority: 10,
  },
};

/** Tool names that have system-default docs. */
export const TOOL_NAMES = Object.keys(toolTemplates);
