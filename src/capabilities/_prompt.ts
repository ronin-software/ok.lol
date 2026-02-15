import { assert } from "@/lib/assert";
import type { Document, OriginExecutionContext } from "./_execution-context";

/**
 * Budget-aware system prompt assembly.
 *
 * Documents are injected by priority (lower first) up to a total char
 * budget. Large documents are truncated with a marker. Omitted documents
 * are noted so the agent knows to use `read_document` for full content.
 */

/** Max characters per individual document before truncation. */
const BUDGET_PER_DOC = 20_000;

/** Max total characters for all injected documents combined. */
const BUDGET_TOTAL = 24_000;

/** Marker appended when a document is truncated. */
const TRUNCATION_MARKER =
  "\n\n[... truncated — use read_document to load the full content]";

/** Options for prompt assembly. */
export type PromptOptions = {
  /** Total char budget for documents (default 24,000). */
  budget?: number;
  /** Hire caller info, if executing on behalf of another principal. */
  caller?: OriginExecutionContext["caller"];
  /** Available capabilities for the directory section. */
  capabilities: { description: string; name: string }[];
  /** Credit balance in micro-USD. */
  credits: bigint;
  /** Principal's documents (already merged with defaults). */
  documents: Document[];
  /** Principal's username. */
  username: string;
};

/**
 * Assembles the system prompt from runtime context and documents.
 *
 * Sections: preamble, documents (budget-aware), capabilities directory.
 * Returns the complete system prompt string.
 */
export function assemblePrompt(options: PromptOptions): string {
  assert(options.username.length > 0, "username must be non-empty");
  assert(options.documents.length > 0, "documents must be non-empty");
  assert(options.capabilities.length > 0, "capabilities must be non-empty");
  const budget = options.budget ?? BUDGET_TOTAL;
  assert(budget > 0, "budget must be positive");

  const preamble = buildPreamble(options);
  const { omitted, section: docs } = buildDocuments(options.documents, budget);
  const caps = buildCapabilities(options.capabilities);
  const parts = [preamble, docs, caps];

  // If any documents were omitted, tell the agent it can load them.
  if (omitted.length > 0) {
    const paths = omitted.map((d) => d.path).join(", ");
    parts.push(
      `## Omitted Documents\n\nThe following documents exceeded the context budget and were not injected: ${paths}.\nUse \`read_document\` to load them on demand.`,
    );
  }

  return parts.join("\n\n");
}

// –
// Preamble
// –

/** Runtime context section: who you are, credit balance, time, caller. */
function buildPreamble(options: PromptOptions): string {
  const lines = [
    `You are ${options.username}@ok.lol, an always-on AI principal.`,
    `Credits: ${options.credits} micro-USD.`,
    `Time: ${new Date().toISOString()}.`,
  ];

  if (options.caller) {
    lines.push(
      `You were hired by ${options.caller.username}@ok.lol (hire ${options.caller.hireId}).`,
    );
  }

  return lines.join("\n");
}

// –
// Documents
// –

/** Injects documents by priority up to the total char budget. */
function buildDocuments(
  documents: Document[],
  budget: number,
): { omitted: Document[]; section: string } {
  // Sort by priority ascending (lower = earlier). Stable sort preserves
  // insertion order for equal priorities.
  const sorted = [...documents].sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
  );

  const parts: string[] = [];
  const omitted: Document[] = [];
  let remaining = budget;

  for (const doc of sorted) {
    if (remaining <= 0) {
      omitted.push(doc);
      continue;
    }

    const header = doc.default
      ? `## ${doc.path} (default — customize by writing to this path)`
      : `## ${doc.path}`;

    // Truncate content if it exceeds per-doc or remaining budget.
    const limit = Math.min(BUDGET_PER_DOC, remaining);
    let body = doc.contents;
    if (body.length > limit) {
      body = body.slice(0, limit) + TRUNCATION_MARKER;
    }

    parts.push(`${header}\n${body}`);
    remaining -= body.length;
  }

  assert(parts.length > 0, "at least one document must be injected");
  return { omitted, section: parts.join("\n\n") };
}

// –
// Capabilities
// –

/** Compact directory of available capabilities (tools). */
function buildCapabilities(
  capabilities: { description: string; name: string }[],
): string {
  const lines = capabilities.map((c) => `- **${c.name}**: ${c.description}`);
  return `## Tools\n\n${lines.join("\n")}`;
}
