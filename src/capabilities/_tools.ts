import { db } from "@/db";
import { document } from "@/db/schema";
import { assert } from "@/lib/assert";
import { tool } from "ai";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { OriginExecutionContext } from "./_execution-context";
import emailSend from "./email-send";

/**
 * Tool registry for the `act` agent loop.
 *
 * Factory function that creates AI SDK tools closed over the execution
 * context. Adding a new tool = adding a property to the returned object.
 */
export function makeTools(ectx: OriginExecutionContext) {
  assert(ectx.principal.username, "principal must have a username");
  assert(ectx.principal.id, "principal must have an id");

  return {
    list_documents: listDocuments(ectx),
    read_document: readDocument(ectx),
    send_email: sendEmail(ectx),
    write_document: writeDocument(ectx),
  };
}

/** Descriptions for the capability directory in the system prompt. */
export const toolDirectory: { description: string; name: string }[] = [
  { description: "List all your document paths", name: "list_documents" },
  { description: "Read a document by path", name: "read_document" },
  { description: "Send an email from your @ok.lol address", name: "send_email" },
  { description: "Write or update a document by path", name: "write_document" },
];

// –
// Email
// –

/** Send an email from the principal's @ok.lol address. */
function sendEmail(ectx: OriginExecutionContext) {
  return tool({
    description: "Send an email from your @ok.lol address.",
    execute: async ({ subject, text, to }) => {
      await emailSend.call(ectx, { subject, text, to });
      return { sent: true, to };
    },
    inputSchema: z.object({
      subject: z.string().describe("Email subject line"),
      text: z.string().describe("Plain text email body"),
      to: z.string().email().describe("Recipient email address"),
    }),
  });
}

// –
// Documents
// –

/** List all document paths for this principal. */
function listDocuments(ectx: OriginExecutionContext) {
  return tool({
    description: "List all your document paths.",
    execute: async () => {
      const rows = await db
        .select({ path: document.path })
        .from(document)
        .where(eq(document.principalId, ectx.principal.id))
        .orderBy(desc(document.createdAt));

      // Deduplicate to latest per path (query is ordered by createdAt desc).
      const seen = new Set<string>();
      const paths: string[] = [];
      for (const row of rows) {
        if (seen.has(row.path)) continue;
        seen.add(row.path);
        paths.push(row.path);
      }

      return { paths };
    },
    inputSchema: z.object({}),
  });
}

/** Read a single document by path. Returns the latest version. */
function readDocument(ectx: OriginExecutionContext) {
  return tool({
    description: "Read one of your documents by path. Returns the latest version.",
    execute: async ({ path }) => {
      assert(path.length > 0, "path must be non-empty");

      // Latest version per (principalId, path): ordered desc, first match wins.
      const rows = await db
        .select()
        .from(document)
        .where(eq(document.principalId, ectx.principal.id))
        .orderBy(desc(document.createdAt));
      const match = rows.find((r) => r.path === path);

      if (!match) return { error: `No document at path "${path}"` };

      return {
        contents: match.content,
        editedBy: match.editedBy,
        path: match.path,
        updatedAt: match.createdAt.toISOString(),
      };
    },
    inputSchema: z.object({
      path: z.string().describe("Document path (e.g. 'soul', 'skills/research')"),
    }),
  });
}

/** Write or update a document. Inserts a new version (append-only). */
function writeDocument(ectx: OriginExecutionContext) {
  return tool({
    description: "Write or update one of your documents. Creates a new version.",
    execute: async ({ content, path }) => {
      assert(path.length > 0, "path must be non-empty");
      assert(content.length > 0, "content must be non-empty");

      await db.insert(document).values({
        content,
        editedBy: "principal",
        path,
        principalId: ectx.principal.id,
      });

      return { path, written: true };
    },
    inputSchema: z.object({
      content: z.string().describe("Document content (markdown)"),
      path: z.string().describe("Document path (e.g. 'soul', 'identity')"),
    }),
  });
}
