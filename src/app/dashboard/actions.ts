"use server";

import { db } from "@/db";
import { document, principal, worker } from "@/db/schema";
import { verify } from "@/lib/session";
import { and, eq } from "drizzle-orm";

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

/** Tunnel domain for auto-generated worker URLs. */
const TUNNEL_DOMAIN = process.env.TUNNEL_DOMAIN ?? "w.ok.lol";

/** Register a new worker for the current account. */
export async function createWorker(): Promise<{
  error?: string;
  id?: string;
  ok?: boolean;
  secret?: string;
}> {
  const accountId = await verify();
  if (!accountId) return { error: "Unauthorized" };

  const id = crypto.randomUUID();
  const secret = generateSecret();
  const url = `https://${id}.${TUNNEL_DOMAIN}`;

  await db.insert(worker).values({ accountId, id, secret, url });

  return { id, ok: true, secret };
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

// –
// Probing
// –

const TUNNEL_KEY = process.env.TUNNEL_KEY ?? "";
const PROBE_TIMEOUT_MS = 3_000;

/**
 * Probe all workers for the current account, updating reported hostnames.
 * Returns a map of worker ID → name for any that responded.
 */
export async function probeWorkers(): Promise<Record<string, string>> {
  const accountId = await verify();
  if (!accountId) return {};

  const rows = await db
    .select({ id: worker.id, url: worker.url })
    .from(worker)
    .where(eq(worker.accountId, accountId));

  const names: Record<string, string> = {};

  await Promise.all(
    rows.map(async (row) => {
      try {
        const headers: Record<string, string> = {};
        if (TUNNEL_KEY) headers["X-Tunnel-Key"] = TUNNEL_KEY;

        const res = await fetch(row.url, {
          headers,
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        if (!res.ok) return;

        const body = (await res.json()) as { name?: unknown };
        const name = typeof body.name === "string" ? body.name : null;
        if (!name) return;

        names[row.id] = name;
        await db
          .update(worker)
          .set({ name })
          .where(and(eq(worker.id, row.id), eq(worker.accountId, accountId)));
      } catch {
        // Offline — skip.
      }
    }),
  );

  return names;
}

/** Probe a single worker by ID. Returns its name if online, null otherwise. */
export async function probeWorker(
  id: string,
): Promise<{ name: string | null }> {
  const accountId = await verify();
  if (!accountId) return { name: null };

  const [row] = await db
    .select({ url: worker.url })
    .from(worker)
    .where(and(eq(worker.id, id), eq(worker.accountId, accountId)));
  if (!row) return { name: null };

  try {
    const headers: Record<string, string> = {};
    if (TUNNEL_KEY) headers["X-Tunnel-Key"] = TUNNEL_KEY;

    const res = await fetch(row.url, {
      headers,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return { name: null };

    const body = (await res.json()) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name : null;
    if (!name) return { name: null };

    await db
      .update(worker)
      .set({ name })
      .where(and(eq(worker.id, id), eq(worker.accountId, accountId)));

    return { name };
  } catch {
    return { name: null };
  }
}
