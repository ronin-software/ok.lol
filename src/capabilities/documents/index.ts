/**
 * Document capabilities — list, read, and write principal documents.
 *
 * Each is a `Capability` that closes over the execution context at
 * call time. Append-only versioning: writes insert new rows.
 */

import { db } from "@/db";
import { document } from "@/db/schema";
import { assert } from "@/lib/assert";
import { embedTexts } from "@/lib/relevance";
import type { Capability } from "@ok.lol/capability";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Activation, OriginExecutionContext } from "../context";

// –
// List
// –

const listInput = z.object({});
const listOutput = z.object({
  paths: z.array(z.string()),
});

type ListInput = z.infer<typeof listInput>;
type ListOutput = z.infer<typeof listOutput>;

/** List all document paths for this principal. */
export const documentList: Capability<OriginExecutionContext, ListInput, ListOutput> = {
  async call(ectx) {
    // DISTINCT ON picks the latest row per path without fetching all versions.
    const rows = await db.execute<{ path: string }>(sql`
      SELECT DISTINCT ON (path) path
      FROM document
      WHERE principal_id = ${ectx.principal.id}
      ORDER BY path, created_at DESC
    `);

    return { paths: rows.map((r) => r.path) };
  },

  description: "List all your document paths",
  name: "document_list",

  inputSchema: listInput,
  outputSchema: listOutput,
};

// –
// Read
// –

const readInput = z.object({
  path: z.string().describe("Document path (e.g. 'soul', 'skills/research')"),
});
const readOutput = z.object({
  contents: z.string().optional(),
  editedBy: z.string().optional(),
  error: z.string().optional(),
  path: z.string().optional(),
  updatedAt: z.string().optional(),
});

type ReadInput = z.infer<typeof readInput>;
type ReadOutput = z.infer<typeof readOutput>;

/** Read a single document by path. Returns the latest version. */
export const documentRead: Capability<OriginExecutionContext, ReadInput, ReadOutput> = {
  async call(ectx, { path }) {
    assert(path.length > 0, "path must be non-empty");

    // Latest version for this (principalId, path) pair.
    const [match] = await db
      .select()
      .from(document)
      .where(
        and(
          eq(document.principalId, ectx.principal.id),
          eq(document.path, path),
        ),
      )
      .orderBy(desc(document.createdAt))
      .limit(1);

    if (!match) return { error: `No document at path "${path}"` };

    return {
      contents: match.content,
      editedBy: match.editedBy,
      path: match.path,
      updatedAt: match.createdAt.toISOString(),
    };
  },

  description: "Read one of your documents by path. Returns the latest version",
  name: "document_read",

  inputSchema: readInput,
  outputSchema: readOutput,
};

// –
// Write
// –

const activationSchema = z.object({
  negative: z.array(z.string()).optional().describe("Phrases for when this doc should NOT be in context"),
  positive: z.array(z.string()).optional().describe("Phrases for when this doc should be in context"),
}).optional().describe("Relevance filtering. Omit to always inject this document");

const writeInput = z.object({
  activation: activationSchema,
  content: z.string().describe("Document content (markdown)"),
  path: z.string().describe("Document path (e.g. 'soul', 'identity')"),
});
const writeOutput = z.object({
  path: z.string(),
  written: z.boolean(),
});

type WriteInput = z.infer<typeof writeInput>;
type WriteOutput = z.infer<typeof writeOutput>;

/** Embed activation phrases and return the full Activation object with embeddings. */
async function embedActivation(
  input: { negative?: string[]; positive?: string[] },
): Promise<Activation> {
  const pos = (input.positive ?? []).filter(Boolean);
  const neg = (input.negative ?? []).filter(Boolean);
  const all = [...pos, ...neg];
  if (all.length === 0) return { negative: input.negative, positive: input.positive };

  const vecs = await embedTexts(all);
  return {
    embeddings: {
      negative: vecs.slice(pos.length),
      positive: vecs.slice(0, pos.length),
    },
    negative: input.negative,
    positive: input.positive,
  };
}

/** Write or update a document. Inserts a new version (append-only). */
export const documentWrite: Capability<OriginExecutionContext, WriteInput, WriteOutput> = {
  async call(ectx, { activation: activationInput, content, path }) {
    assert(path.length > 0, "path must be non-empty");
    assert(content.length > 0, "content must be non-empty");

    const activation = activationInput
      ? await embedActivation(activationInput)
      : null;

    await db.insert(document).values({
      ...(activation ? { activation } : {}),
      content,
      editedBy: "principal",
      path,
      principalId: ectx.principal.id,
    });

    return { path, written: true };
  },

  description: "Write or update one of your documents. Creates a new version",
  name: "document_write",

  inputSchema: writeInput,
  outputSchema: writeOutput,
};
