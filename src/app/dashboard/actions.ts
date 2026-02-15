"use server";

import { db } from "@/db";
import { document } from "@/db/schema";
import { verify } from "@/lib/session";
import { eq } from "drizzle-orm";
import { principal } from "@/db/schema";

/**
 * Save a document for the current user's pal.
 * Inserts a new version (append-only) with `editedBy: "user"`.
 *
 * Returns `{ ok: true }` on success, `{ error: string }` on failure.
 */
export async function saveDocument(
  principalId: string,
  path: string,
  content: string,
  priority: number,
): Promise<{ error?: string; ok?: boolean }> {
  const accountId = await verify();
  if (!accountId) return { error: "Unauthorized" };

  // Verify the principal belongs to this account.
  const pal = await db
    .select({ accountId: principal.accountId })
    .from(principal)
    .where(eq(principal.id, principalId))
    .then((rows) => rows[0]);
  if (!pal || pal.accountId !== accountId) return { error: "Forbidden" };

  await db.insert(document).values({
    content,
    editedBy: "user",
    path,
    principalId,
    priority,
  });

  return { ok: true };
}
