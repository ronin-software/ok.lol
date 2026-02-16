"use server";

import { db } from "@/db";
import { document, principal, worker } from "@/db/schema";
import { verify } from "@/lib/session";
import { eq } from "drizzle-orm";

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

// –
// Workers
// –

/** Generate a random 256-bit signing key (hex-encoded). */
function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Register a new worker endpoint for the current account. */
export async function createWorker(
  name: string,
  url: string,
): Promise<{ error?: string; id?: string; ok?: boolean; secret?: string }> {
  const accountId = await verify();
  if (!accountId) return { error: "Unauthorized" };

  if (!name || name.length > 64) return { error: "Name required (max 64 chars)" };
  if (!url) return { error: "URL required" };
  try { new URL(url); } catch { return { error: "Invalid URL" }; }

  const secret = generateSecret();
  const [row] = await db
    .insert(worker)
    .values({ accountId, name, secret, url })
    .returning({ id: worker.id });

  return { id: row.id, ok: true, secret };
}

/** Remove a worker endpoint. Verifies account ownership. */
export async function deleteWorker(
  id: string,
): Promise<{ error?: string; ok?: boolean }> {
  const accountId = await verify();
  if (!accountId) return { error: "Unauthorized" };

  const [row] = await db
    .select({ accountId: worker.accountId })
    .from(worker)
    .where(eq(worker.id, id));
  if (!row || row.accountId !== accountId) return { error: "Not found" };

  await db.delete(worker).where(eq(worker.id, id));
  return { ok: true };
}
