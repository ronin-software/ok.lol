/**
 * YAML frontmatter parser for documents.
 *
 * Documents use `---`-delimited YAML frontmatter to carry tags
 * and access control lists. The body is the content after the
 * closing `---`.
 */

import { parse as parseYaml } from "yaml";

// –
// Types
// –

/** Permission levels for document access control. */
export type Permission =
  | "context"
  | "read"
  | "visibility"
  | "write"
  | "write-meta";

/** Access control fields, keyed as `allow-{permission}`. */
export type AccessControl = {
  [K in `allow-${Permission}`]?: string[];
};

/** Frontmatter for contact documents (`contacts/*.md`). */
export type ContactFrontmatter = AccessControl & {
  /** Email addresses associated with this contact. */
  emails?: string[];
  /** Handles on other platforms, keyed by platform name. */
  handles?: Record<string, string>;
  /** Tags for grouping contacts. */
  tags?: string[];
};

/** Frontmatter for any document. */
export type DocumentFrontmatter = AccessControl & {
  /** Tags for grouping documents. */
  tags?: string[];
};

/** Parsed result: frontmatter attributes + stripped body. */
export type Parsed<T = DocumentFrontmatter> = {
  /** Parsed YAML attributes, or empty object if no frontmatter. */
  attributes: T;
  /** Content after the frontmatter block. */
  body: string;
};

// –
// Parser
// –

const FENCE = "---";
const FENCE_RE = /^---\s*\n/;

/** Parse YAML frontmatter from document content. */
export function parseFrontmatter<T = DocumentFrontmatter>(content: string): Parsed<T> {
  if (!content.startsWith(FENCE)) {
    return { attributes: {} as T, body: content };
  }

  // Find closing fence (must be on its own line).
  const afterOpen = content.indexOf("\n") + 1;
  const closeIdx = content.indexOf(`\n${FENCE}`, afterOpen);
  if (closeIdx === -1) {
    return { attributes: {} as T, body: content };
  }

  const yamlBlock = content.slice(afterOpen, closeIdx);
  const bodyStart = closeIdx + 1 + FENCE.length;
  // Skip the newline after the closing fence.
  const body = content[bodyStart] === "\n"
    ? content.slice(bodyStart + 1)
    : content.slice(bodyStart);

  const attributes = (parseYaml(yamlBlock) ?? {}) as T;
  return { attributes, body };
}

/** Serialize frontmatter + body back into document content. */
export function serializeFrontmatter<T extends Record<string, unknown>>(
  attributes: T,
  body: string,
): string {
  const keys = Object.keys(attributes).filter(
    (k) => attributes[k] !== undefined && attributes[k] !== null,
  );
  if (keys.length === 0) return body;

  // Build YAML lines manually for deterministic output.
  const lines: string[] = [];
  for (const key of keys.sort()) {
    const val = attributes[key];
    if (Array.isArray(val)) {
      lines.push(`${key}:`);
      for (const item of val) {
        lines.push(`  - ${JSON.stringify(item)}`);
      }
    } else if (typeof val === "object" && val !== null) {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) {
        lines.push(`  ${k}: ${JSON.stringify(v)}`);
      }
    } else {
      lines.push(`${key}: ${JSON.stringify(val)}`);
    }
  }

  return `---\n${lines.join("\n")}\n---\n${body}`;
}

/** Extract the `allow-{permission}` list from frontmatter. */
export function getAllowList(
  fm: AccessControl,
  permission: Permission,
): string[] | undefined {
  return fm[`allow-${permission}`];
}
