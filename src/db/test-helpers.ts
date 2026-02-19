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
import { account, principal } from "./schema";

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
  await db.delete(account).where(eq(account.id, TEST_ACCOUNT_ID));
}
