/**
 * Integration tests for contact queries.
 *
 * Requires a local Postgres instance (Docker Compose). Skips if unreachable.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  findContact,
  findOwnerContact,
  seedOwnerContact,
  upsertContact,
} from "./contacts";
import { cleanup, hasDb, seedAccount, seedPrincipal } from "./test-helpers";

const HAS_DB = await hasDb();
let principalId: string;

beforeEach(async () => {
  if (!HAS_DB) return;
  await seedAccount();
  principalId = await seedPrincipal();
});

afterEach(async () => {
  if (!HAS_DB) return;
  await cleanup();
});

// –
// Owner contact
// –

describe.skipIf(!HAS_DB)("seedOwnerContact + findOwnerContact", () => {
  test("seeds and retrieves owner contact", async () => {
    await seedOwnerContact(principalId, "owner@test.com", "Owner");
    const owner = await findOwnerContact(principalId);
    expect(owner).not.toBeNull();
    expect(owner!.email).toBe("owner@test.com");
    expect(owner!.name).toBe("Owner");
    expect(owner!.relationship).toBe("owner");
  });

  test("idempotent — no error on duplicate seed", async () => {
    await seedOwnerContact(principalId, "owner@test.com");
    await seedOwnerContact(principalId, "owner@test.com");
    const owner = await findOwnerContact(principalId);
    expect(owner).not.toBeNull();
  });

  test("returns null when no owner seeded", async () => {
    const owner = await findOwnerContact(principalId);
    expect(owner).toBeNull();
  });
});

// –
// General contacts
// –

describe.skipIf(!HAS_DB)("upsertContact + findContact", () => {
  test("creates a new contact", async () => {
    await upsertContact(principalId, {
      email: "alice@example.com",
      name: "Alice",
    });
    const found = await findContact(principalId, "alice@example.com");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Alice");
    expect(found!.relationship).toBe("contact");
  });

  test("no-op on duplicate email", async () => {
    await upsertContact(principalId, { email: "bob@example.com", name: "Bob" });
    await upsertContact(principalId, { email: "bob@example.com", name: "Robert" });
    const found = await findContact(principalId, "bob@example.com");
    // First insert wins — onConflictDoNothing.
    expect(found!.name).toBe("Bob");
  });

  test("returns null for unknown email", async () => {
    const found = await findContact(principalId, "unknown@example.com");
    expect(found).toBeNull();
  });

  test("contacts are scoped to principal", async () => {
    await upsertContact(principalId, { email: "alice@example.com" });
    const other = await seedPrincipal(undefined, { username: "test-other" });
    const found = await findContact(other, "alice@example.com");
    expect(found).toBeNull();
  });
});
