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
  contact_list: {
    activation: {
      positive: ["who do I know", "list contacts", "all contacts"],
      negative: ["write a document", "read a thread"],
    },
    contents:
      "List all known contacts. Use to get a full picture of who you know. " +
      "For targeted lookups, prefer contact_lookup (by email) or contact_search (by name).",
    priority: 10,
  },

  contact_lookup: {
    activation: {
      positive: ["received email", "who is this", "look up sender", "identify contact"],
      negative: ["write a document", "fetch a URL"],
    },
    contents:
      "Look up a person by email. **Always call before replying to or emailing someone** — " +
      "this tells you their trust level (owner vs contact vs unknown) and where your notes about them live. " +
      "Returns null if the email isn't in your contacts; follow up with contact_record to save them.",
    priority: 10,
  },

  contact_lookup_owner: {
    activation: {
      positive: ["email my owner", "who is my owner", "contact owner", "notify owner"],
      negative: ["search threads", "read document"],
    },
    contents:
      "Get the account holder's email and name. Use when you need to reach or identify the owner " +
      "without knowing their address. Zero-input — the principal is implicit.",
    priority: 10,
  },

  contact_record: {
    activation: {
      positive: ["new person", "save contact", "record contact", "unknown sender"],
      negative: ["send email", "read thread"],
    },
    contents:
      "Save a new contact (name + email). No-op if the contact already exists. " +
      "Call this after encountering someone new — especially after contact_lookup returns null.",
    priority: 10,
  },

  contact_search: {
    activation: {
      positive: ["find contact", "search contacts", "who is named", "look up by name"],
      negative: ["write document", "fetch URL"],
    },
    contents:
      "Search contacts by name or email (substring match). " +
      "Use when you have a name but not an email, or want partial matches.",
    priority: 10,
  },

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
      "was truncated in your context. Also useful for loading contact notes at `contacts/{email}`.",
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
      "You can customize your own tool guides (for example, with learnings, difficulties encountered, wishes or DO's/DONT's) by writing to `tools/{name}`.",
    priority: 10,
  },

  email_send: {
    activation: {
      positive: ["send email", "reply to email", "email someone", "compose email"],
      negative: ["read document", "search threads"],
    },
    contents:
      "Send an email from your address.\n\n" +
      "**Prerequisites:** Always verify the recipient via contact_lookup or contact_search first. " +
      "Use `to: \"owner\"` to email the account holder.\n\n" +
      "**Threading:** Always pass `threadId` when sending from within a thread so replies land in the right place.\n\n" +
      "**Don't** email your owner when follow_up would work — prefer in-thread communication.",
    priority: 10,
  },

  follow_up: {
    activation: {
      positive: ["follow up", "post in thread", "notify thread", "update waiting thread"],
      negative: ["fetch URL", "write document"],
    },
    contents:
      "Post a message in a thread you're not currently acting in. " +
      "**Use when a thread is waiting for information you now have.**\n\n" +
      "Search threads first (thread_search or thread_list) to find the right one. " +
      "Post in the existing waiting thread — don't create new ones. " +
      "Don't use this when the owner is asking you directly in the current thread.",
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
      "List recent threads with latest snippet. Filter by channel (chat/email). " +
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
      "Use to find related conversations — essential before using follow_up to locate the right thread.",
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
