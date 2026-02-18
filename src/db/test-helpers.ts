/**
 * Test helpers for database integration tests.
 *
 * Uses the local Docker Postgres. Tests that need a DB connection
 * skip gracefully when the database is unreachable.
 *
 * Each test suite should call `cleanup()` in afterEach to remove
 * test data. Test data uses deterministic IDs prefixed with
 * `test-` so cleanup is targeted and safe.
 */

import { eq, sql } from "drizzle-orm";
import { db } from ".";
import {
  account,
  contact,
  document,
  message,
  principal,
  thread,
} from "./schema";

// –
// Connectivity
// –

/** True when the database is reachable. Resolved once, cached. */
let dbReachable: boolean | undefined;
export async function hasDb(): Promise<boolean> {
  if (dbReachable !== undefined) return dbReachable;
  try {
    await db.execute(sql`SELECT 1`);
    dbReachable = true;
  } catch {
    dbReachable = false;
  }
  return dbReachable;
}

// –
// Test data factories
// –

const TEST_ACCOUNT_ID = "99999999999999999999";

/** Seed a test account. Returns the account ID. */
export async function seedAccount(
  id = TEST_ACCOUNT_ID,
  email = "test@test.com",
) {
  await db
    .insert(account)
    .values({ email, id })
    .onConflictDoNothing();
  return id;
}

/** Seed a test principal. Returns the principal ID. */
export async function seedPrincipal(
  accountId = TEST_ACCOUNT_ID,
  overrides: { id?: string; name?: string; username?: string } = {},
) {
  const id = overrides.id ?? crypto.randomUUID();
  const name = overrides.name ?? "Test Pal";
  const username = overrides.username ?? `test-${id.slice(0, 8)}`;
  await db
    .insert(principal)
    .values({ accountId, id, name, username })
    .onConflictDoNothing();
  return id;
}

// –
// Cleanup
// –

/** Remove all test data created during a test. */
export async function cleanup() {
  // Delete in FK order: messages -> threads -> documents -> contacts -> principals -> accounts.
  // Only delete data tied to the test account.
  const principals = await db
    .select({ id: principal.id })
    .from(principal)
    .where(eq(principal.accountId, TEST_ACCOUNT_ID));
  const pids = principals.map((p) => p.id);

  if (pids.length > 0) {
    for (const pid of pids) {
      // Messages via threads.
      const threads = await db
        .select({ id: thread.id })
        .from(thread)
        .where(eq(thread.principalId, pid));
      for (const t of threads) {
        await db.delete(message).where(eq(message.threadId, t.id));
      }
      await db.delete(thread).where(eq(thread.principalId, pid));
      await db.delete(document).where(eq(document.principalId, pid));
      await db.delete(contact).where(eq(contact.principalId, pid));
    }
    for (const pid of pids) {
      await db.delete(principal).where(eq(principal.id, pid));
    }
  }
  await db.delete(account).where(eq(account.id, TEST_ACCOUNT_ID));
}
