/**
 * Document capabilities — list, read, write, and delete principal documents.
 *
 * Each is a `Capability` that closes over the execution context at
 * call time. Writes are append-only (versioned). Deletes physically
 * remove all versions — used for ephemeral documents like proactivity.
 */

import { db } from "@/db";
import { document } from "@/db/schema";
import { isAllowed } from "@/lib/access";
import { assert } from "@/lib/assert";
import { parseFrontmatter, type DocumentFrontmatter } from "@/lib/frontmatter";
import { embedActivation } from "@/lib/relevance";
import type { Capability } from "@ok.lol/capability";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { OriginExecutionContext } from "../context";

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
    const rows = await db.execute<{ content: string; path: string }>(sql`
      SELECT DISTINCT ON (path) path, content
      FROM document
      WHERE principal_id = ${ectx.principal.id}
      ORDER BY path, created_at DESC
    `);

    const visible = rows.filter((r) =>
      isAllowed(
        { contents: r.content, path: r.path },
        ectx.contact,
        ectx.contactFm,
        "visibility",
      ),
    );

    return { paths: visible.map((r) => r.path) };
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

    if (match) {
      if (!isAllowed({ contents: match.content, path }, ectx.contact, ectx.contactFm, "read")) {
        return { error: `Access denied for path "${path}"` };
      }
      return {
        contents: match.content,
        editedBy: match.editedBy,
        path: match.path,
        updatedAt: match.createdAt.toISOString(),
      };
    }

    const fallback = ectx.principal.documents.find((d) => d.path === path);
    if (fallback) {
      if (!isAllowed(fallback, ectx.contact, ectx.contactFm, "read")) {
        return { error: `Access denied for path "${path}"` };
      }
      return {
        contents: fallback.contents,
        path: fallback.path,
      };
    }

    return { error: `No document at path "${path}"` };
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

/** Write or update a document. Inserts a new version (append-only). */
export const documentWrite: Capability<OriginExecutionContext, WriteInput, WriteOutput> = {
  async call(ectx, { activation: activationInput, content, path }) {
    assert(path.length > 0, "path must be non-empty");
    assert(content.length > 0, "content must be non-empty");

    // Check write permission against existing doc (if any).
    const existing = ectx.principal.documents.find((d) => d.path === path);
    if (existing && !isAllowed(existing, ectx.contact, ectx.contactFm, "write")) {
      return { path, written: false };
    }

    // If the new content changes frontmatter, check write-meta permission.
    if (existing) {
      const oldFm = parseFrontmatter<DocumentFrontmatter>(existing.contents).attributes;
      const newFm = parseFrontmatter<DocumentFrontmatter>(content).attributes;
      const fmChanged = JSON.stringify(oldFm) !== JSON.stringify(newFm);
      if (fmChanged && !isAllowed(existing, ectx.contact, ectx.contactFm, "write-meta")) {
        return { path, written: false };
      }
    }

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

// –
// Delete
// –

const deleteInput = z.object({
  path: z.string().describe("Document path to delete"),
});
const deleteOutput = z.object({
  deleted: z.boolean(),
  path: z.string(),
});

type DeleteInput = z.infer<typeof deleteInput>;
type DeleteOutput = z.infer<typeof deleteOutput>;

/** Delete a document and all its versions. */
export const documentDelete: Capability<OriginExecutionContext, DeleteInput, DeleteOutput> = {
  async call(ectx, { path }) {
    assert(path.length > 0, "path must be non-empty");

    const result = await db
      .delete(document)
      .where(
        and(
          eq(document.principalId, ectx.principal.id),
          eq(document.path, path),
        ),
      )
      .returning({ id: document.id });

    return { deleted: result.length > 0, path };
  },

  description: "Delete a document and all its versions",
  name: "document_delete",

  inputSchema: deleteInput,
  outputSchema: deleteOutput,
};
