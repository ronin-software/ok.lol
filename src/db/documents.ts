/**
 * Document queries shared across the dashboard and capabilities.
 *
 * The document table is append-only — current state is the latest row
 * per (principalId, path). These helpers encapsulate that dedup logic.
 */

import type { Document } from "@/capabilities/context";
import { sql } from "drizzle-orm";
import { db } from ".";

// Raw snake_case row returned by the DISTINCT ON query below.
type DocumentRow = {
  content: string;
  created_at: string;
  edited_by: "principal" | "user";
  path: string;
  priority: number;
};

/**
 * Fetch the current (latest version per path) documents for a principal.
 *
 * Uses DISTINCT ON (path) ordered by (path, created_at DESC) so Postgres
 * picks one row per path — the newest — without fetching all versions.
 * The document_principal_path_idx covers this exactly.
 */
export async function currentDocuments(
  principalId: string,
): Promise<Document[]> {
  const rows = await db.execute<DocumentRow>(sql`
    SELECT DISTINCT ON (path)
      id, principal_id, path, content, priority, edited_by, created_at
    FROM document
    WHERE principal_id = ${principalId}
    ORDER BY path, created_at DESC
  `);

  return rows.map((d) => ({
    contents: d.content,
    path: d.path,
    priority: d.priority,
    updatedAt: new Date(d.created_at as string).toISOString(),
    updatedBy: d.edited_by as Document["updatedBy"],
  }));
}
