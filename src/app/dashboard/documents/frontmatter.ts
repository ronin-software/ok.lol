/**
 * Frontmatter serialization for document metadata fields.
 *
 * Every document gets a frontmatter block. Known fields (priority,
 * inject-when, suppress-when) are extracted on parse for structured use.
 * Arbitrary user-defined fields are preserved verbatim alongside them.
 * Serialize always emits all known fields so users can discover them.
 */

import type { ActivationInput } from "../actions";

/** Result of parsing a document with optional frontmatter. */
export type Parsed = {
  /** Activation phrases extracted from frontmatter. */
  activation?: ActivationInput;
  /** Document body after the frontmatter block. */
  body: string;
  /** Arbitrary user-defined frontmatter lines (preserved verbatim). */
  extra: string[];
  /** Injection priority extracted from frontmatter. */
  priority: number;
};

const FENCE = "---";

// Comments re-emitted above each known field.
const COMMENTS: Record<string, string> = {
  "inject-when": "# phrases that trigger injection",
  priority: "# injection order (lower = first)",
  "suppress-when": "# phrases that suppress injection",
};

const KNOWN_KEYS = new Set(Object.keys(COMMENTS));
const KNOWN_COMMENTS = new Set(Object.values(COMMENTS));

// –
// Parse
// –

/** Extract structured fields from frontmatter, returning the remaining body. */
export function parse(text: string): Parsed {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith(FENCE)) return { body: text, extra: [], priority: 0 };

  const end = trimmed.indexOf(`\n${FENCE}`, FENCE.length);
  if (end === -1) return { body: text, extra: [], priority: 0 };

  const raw = trimmed.slice(FENCE.length + 1, end);
  const body = trimmed.slice(end + FENCE.length + 2); // skip closing fence + \n

  let priority = 0;
  let positive: string[] = [];
  let negative: string[] = [];
  const extra: string[] = [];

  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    // Skip known help comments.
    if (KNOWN_COMMENTS.has(line.trim())) { i++; continue; }

    // Blank lines are separators between known/extra sections — skip.
    if (!line.trim()) { i++; continue; }

    const kvMatch = line.match(/^(\S[^:]*):(.*)$/);
    if (!kvMatch) {
      extra.push(line);
      i++;
      continue;
    }

    const key = kvMatch[1]!.trim();
    const inline = kvMatch[2]!.trim();

    if (key === "priority") {
      priority = Number(inline) || 0;
      i++;
      continue;
    }

    if (key === "inject-when" || key === "suppress-when") {
      // "[]" means explicitly empty.
      if (inline === "[]") { i++; continue; }
      const items = collectList(lines, i, inline);
      if (key === "inject-when") positive = items.values;
      else negative = items.values;
      i = items.next;
      continue;
    }

    // Arbitrary field — preserve key line and indented continuations.
    extra.push(line);
    i++;
    while (i < lines.length && /^\s/.test(lines[i]!)) {
      extra.push(lines[i]!);
      i++;
    }
  }

  const activation: ActivationInput | undefined =
    positive.length || negative.length
      ? {
          ...(negative.length ? { negative } : {}),
          ...(positive.length ? { positive } : {}),
        }
      : undefined;

  return {
    activation,
    body: body.startsWith("\n") ? body.slice(1) : body,
    extra,
    priority,
  };
}

/** Collect YAML list items following a key line. */
function collectList(
  lines: string[],
  start: number,
  inlineValue: string,
): { next: number; values: string[] } {
  const values: string[] = [];
  if (inlineValue) {
    values.push(inlineValue);
    return { next: start + 1, values };
  }
  let i = start + 1;
  while (i < lines.length) {
    const m = lines[i]!.match(/^\s+-\s+(.+)$/);
    if (!m) break;
    values.push(m[1]!.trim());
    i++;
  }
  return { next: i, values };
}

// –
// Serialize
// –

/** Compose a document string with frontmatter. Always includes all known fields. */
export function serialize(
  body: string,
  priority: number,
  activation?: ActivationInput,
  extra?: string[],
): string {
  const fields: string[] = [];

  // Priority — always shown.
  fields.push(COMMENTS.priority!);
  fields.push(`priority: ${priority}`);

  // Inject-when — always shown.
  fields.push(COMMENTS["inject-when"]!);
  if (activation?.positive?.length) {
    fields.push("inject-when:");
    for (const phrase of activation.positive) fields.push(`  - ${phrase}`);
  } else {
    fields.push("inject-when: []");
  }

  // Suppress-when — always shown.
  fields.push(COMMENTS["suppress-when"]!);
  if (activation?.negative?.length) {
    fields.push("suppress-when:");
    for (const phrase of activation.negative) fields.push(`  - ${phrase}`);
  } else {
    fields.push("suppress-when: []");
  }

  // Arbitrary user fields at the end.
  if (extra?.length) {
    fields.push("");
    fields.push(...extra);
  }

  return `${FENCE}\n${fields.join("\n")}\n${FENCE}\n${body}`;
}

// –
// Storage helpers
// –

/**
 * Wrap extra lines into stored content as a mini frontmatter block.
 * The body is the raw text; extra lines (if any) go in a `---` prefix.
 */
export function packExtra(extra: string[], body: string): string {
  if (!extra.length) return body;
  return `${FENCE}\n${extra.join("\n")}\n${FENCE}\n${body}`;
}

/**
 * Inverse of packExtra — strip a leading extra-only frontmatter block
 * from stored content, returning the body and extra lines separately.
 * Uses `parse` internally; known fields in stored content are ignored
 * (they live in dedicated DB columns).
 */
export function unpackExtra(content: string): { body: string; extra: string[] } {
  const { body, extra } = parse(content);
  return { body, extra };
}
