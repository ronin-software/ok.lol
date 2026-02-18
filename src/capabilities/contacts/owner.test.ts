/**
 * Integration tests for the lookup_owner capability.
 *
 * Requires a local Postgres instance (Docker Compose). Skips if unreachable.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { seedOwnerContact } from "@/db/contacts";
import { cleanup, hasDb, seedAccount, seedPrincipal } from "@/db/test-helpers";
import type { OriginExecutionContext } from "../_execution-context";
import lookupOwner from "./owner";

const HAS_DB = await hasDb();
let principalId: string;

/** Minimal execution context for tests. */
function ectx(id: string): OriginExecutionContext {
  return {
    principal: {
      accountId: "99999999999999999999",
      credits: 0n,
      documents: [],
      id,
      name: "Test Pal",
      username: "test",
    },
  };
}

beforeEach(async () => {
  if (!HAS_DB) return;
  await seedAccount();
  principalId = await seedPrincipal();
});

afterEach(async () => {
  if (!HAS_DB) return;
  await cleanup();
});

describe.skipIf(!HAS_DB)("lookup_owner", () => {
  test("returns owner email and name", async () => {
    await seedOwnerContact(principalId, "owner@test.com", "Owner");
    const result = await lookupOwner.call(ectx(principalId), {});
    expect(result).toEqual({ email: "owner@test.com", name: "Owner" });
  });

  test("returns null when no owner contact", async () => {
    const result = await lookupOwner.call(ectx(principalId), {});
    expect(result).toBeNull();
  });
});
