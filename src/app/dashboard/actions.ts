"use server";

import { db } from "@/db";
import { contact, document, principal, worker } from "@/db/schema";
import { verify } from "@/lib/session";
import { probe } from "@/lib/tunnel";
import { and, eq } from "drizzle-orm";

/**
 * Save a document for the current user's pal.
 * Inserts a new version (append-only) with `editedBy: "user"`.
 */
export async function saveDocument(
  principalId: string,
  path: string,
  content: string,
  priority: number,
): Promise<{ error?: string; ok?: boolean }> {
  const accountId = await verify();
  if (!accountId) return { error: "Unauthorized" };

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
// Contacts
// –

/** Remove a contact. Ownership is verified; owner contacts cannot be deleted. */
export async function deleteContact(
  contactId: string,
): Promise<{ error?: string; ok?: boolean }> {
  const accountId = await verify();
  if (!accountId) return { error: "Unauthorized" };

  const [row] = await db
    .select({ principalId: contact.principalId, relationship: contact.relationship })
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);
  if (!row) return { error: "Not found" };

  // Verify the contact belongs to this account's pal.
  const [pal] = await db
    .select({ id: principal.id })
    .from(principal)
    .where(and(eq(principal.id, row.principalId), eq(principal.accountId, accountId)))
    .limit(1);
  if (!pal) return { error: "Forbidden" };

  if (row.relationship === "owner") return { error: "Cannot delete owner contact" };

  await db.delete(contact).where(eq(contact.id, contactId));
  return { ok: true };
}

/** Add a contact for the current user's pal. */
export async function createContact(
  principalId: string,
  name: string,
  email: string,
): Promise<{ error?: string; ok?: boolean }> {
  const accountId = await verify();
  if (!accountId) return { error: "Unauthorized" };

  const pal = await db
    .select({ accountId: principal.accountId })
    .from(principal)
    .where(eq(principal.id, principalId))
    .then((rows) => rows[0]);
  if (!pal || pal.accountId !== accountId) return { error: "Forbidden" };

  if (!email.trim()) return { error: "Email is required" };

  // Prevent duplicates by email within this principal.
  const [existing] = await db
    .select({ id: contact.id })
    .from(contact)
    .where(
      and(
        eq(contact.principalId, principalId),
        eq(contact.email, email.trim().toLowerCase()),
      ),
    )
    .limit(1);
  if (existing) return { error: "Contact already exists" };

  await db.insert(contact).values({
    email: email.trim().toLowerCase(),
    name: name.trim() || null,
    principalId,
    relationship: "contact",
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
      const body = await probe(row.url);
      if (!body || typeof body.name !== "string") return;

      names[row.id] = body.name;
      await db
        .update(worker)
        .set({ name: body.name })
        .where(and(eq(worker.id, row.id), eq(worker.accountId, accountId)));
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

  const body = await probe(row.url);
  if (!body || typeof body.name !== "string") return { name: null };

  await db
    .update(worker)
    .set({ name: body.name })
    .where(and(eq(worker.id, id), eq(worker.accountId, accountId)));

  return { name: body.name };
}
