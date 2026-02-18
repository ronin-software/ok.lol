/**
 * Contact queries.
 *
 * Contacts give a principal a structured address book. The "owner" contact
 * is always present (seeded at principal creation); all others accumulate
 * from interactions. Notes live in documents at `contacts/{email}`.
 */

import { and, eq } from "drizzle-orm";
import { db } from ".";
import { contact } from "./schema";

// –
// Reads
// –

/** The account holder's contact. Every principal has exactly one. */
export async function findOwnerContact(principalId: string) {
  const [row] = await db
    .select()
    .from(contact)
    .where(and(eq(contact.principalId, principalId), eq(contact.relationship, "owner")))
    .limit(1);
  return row ?? null;
}

/** Find a contact by email address. Returns null if unknown. */
export async function findContact(principalId: string, email: string) {
  const [row] = await db
    .select()
    .from(contact)
    .where(and(eq(contact.principalId, principalId), eq(contact.email, email)))
    .limit(1);
  return row ?? null;
}

// –
// Writes
// –

/**
 * Seed the owner contact for a new principal.
 * Safe to call multiple times — no-op on conflict.
 */
export async function seedOwnerContact(
  principalId: string,
  ownerEmail: string,
  ownerName?: string | null,
): Promise<void> {
  await db
    .insert(contact)
    .values({ email: ownerEmail, name: ownerName, principalId, relationship: "owner" })
    .onConflictDoNothing();
}

/** Insert or update a contact by email. Creates if unknown, updates name if provided. */
export async function upsertContact(
  principalId: string,
  values: { email: string; name?: string | null },
): Promise<void> {
  await db
    .insert(contact)
    .values({ ...values, principalId, relationship: "contact" })
    .onConflictDoNothing();
}
