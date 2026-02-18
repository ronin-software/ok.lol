/**
 * Account provisioning: creates accounts and principals across Stripe,
 * Postgres, and TigerBeetle atomically with best-effort rollback on failure.
 */

import { db } from "@/db";
import { seedOwnerContact } from "@/db/contacts";
import { account, principal } from "@/db/schema";
import { createCustomer, stripe } from "@/lib/stripe";
import * as tb from "@/lib/tigerbeetle";
import { eq } from "drizzle-orm";

/**
 * Find or create an account for the given email.
 *
 * On creation: provisions a Stripe customer, inserts the account row,
 * and creates the TigerBeetle ledger entry. Rolls back on failure.
 *
 * Returns the account ID, or null on unrecoverable failure.
 */
export async function upsertAccount(email: string): Promise<string | null> {
  const existing = await db
    .select({ id: account.id })
    .from(account)
    .where(eq(account.email, email))
    .then((rows) => rows[0]);
  if (existing) return existing.id;

  const accountId = String(tb.id());

  let stripeCustomerId: string;
  try {
    stripeCustomerId = await createCustomer(email, accountId);
  } catch (err) {
    console.error("[accounts] Stripe customer creation failed:", err);
    return null;
  }

  try {
    await db.insert(account).values({ email, id: accountId, stripeCustomerId });
  } catch {
    // Race condition — another request created the account.
    await stripe.customers.del(stripeCustomerId).catch(logError);
    const raced = await db
      .select({ id: account.id })
      .from(account)
      .where(eq(account.email, email))
      .then((rows) => rows[0]);
    return raced?.id ?? null;
  }

  try {
    await tb.bootstrap();
    await tb.createAccount(BigInt(accountId));
  } catch (err) {
    console.error("[accounts] TigerBeetle account creation failed:", err);
    await db.delete(account).where(eq(account.id, accountId)).catch(logError);
    await stripe.customers.del(stripeCustomerId).catch(logError);
    return null;
  }

  return accountId;
}

/**
 * Idempotently create a principal and seed its owner contact.
 *
 * No-op if the principal already exists (onConflictDoNothing).
 * Safe to call from both the webhook and the funded redirect.
 */
export async function seedPrincipal(
  accountId: string,
  username: string,
  name: string,
): Promise<void> {
  const [inserted] = await db
    .insert(principal)
    .values({ accountId, name, username })
    .onConflictDoNothing()
    .returning({ id: principal.id });

  if (!inserted) return;

  const [acc] = await db
    .select({ email: account.email, name: account.name })
    .from(account)
    .where(eq(account.id, accountId))
    .limit(1);
  if (acc) await seedOwnerContact(inserted.id, acc.email, acc.name);
}

function logError(err: unknown) {
  console.error("[accounts] Rollback failed:", err);
}
