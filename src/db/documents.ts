/**
 * Document queries shared across the dashboard and capabilities.
 *
 * The document table is append-only — current state is the latest row
 * per (principalId, path). These helpers encapsulate that dedup logic.
 */

import type { Document } from "@/capabilities/_execution-context";
import { desc, eq } from "drizzle-orm";
import { db } from ".";
import { document } from "./schema";

/**
 * Fetch the current (latest version per path) documents for a principal.
 * Returns documents sorted by createdAt descending (newest first).
 */
export async function currentDocuments(
  principalId: string,
): Promise<Document[]> {
  const rows = await db
    .select()
    .from(document)
    .where(eq(document.principalId, principalId))
    .orderBy(desc(document.createdAt));

  // Deduplicate to latest version per path.
  const seen = new Set<string>();
  const current = rows.filter((d) => {
    if (seen.has(d.path)) return false;
    seen.add(d.path);
    return true;
  });

  return current.map((d) => ({
    contents: d.content,
    path: d.path,
    priority: d.priority,
    updatedAt: d.createdAt.toISOString(),
    updatedBy: d.editedBy,
  }));
}
