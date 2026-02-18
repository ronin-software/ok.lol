/**
 * Integration tests for document queries.
 *
 * Requires a local Postgres instance (Docker Compose). Skips if unreachable.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { db } from ".";
import { currentDocuments } from "./documents";
import { document } from "./schema";
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
// currentDocuments
// –

describe.skipIf(!HAS_DB)("currentDocuments", () => {
  test("returns empty for principal with no documents", async () => {
    const docs = await currentDocuments(principalId);
    expect(docs).toHaveLength(0);
  });

  test("returns latest version per path", async () => {
    // Insert two versions of the same path.
    await db.insert(document).values({
      content: "Version 1",
      editedBy: "user",
      path: "soul",
      principalId,
      priority: 0,
    });
    await Bun.sleep(10);
    await db.insert(document).values({
      content: "Version 2",
      editedBy: "principal",
      path: "soul",
      principalId,
      priority: 0,
    });

    const docs = await currentDocuments(principalId);
    expect(docs).toHaveLength(1);
    expect(docs[0]!.contents).toBe("Version 2");
    expect(docs[0]!.path).toBe("soul");
  });

  test("returns one row per distinct path", async () => {
    await db.insert(document).values({
      content: "Soul content",
      editedBy: "user",
      path: "soul",
      principalId,
      priority: -30,
    });
    await db.insert(document).values({
      content: "Identity content",
      editedBy: "user",
      path: "identity",
      principalId,
      priority: -20,
    });

    const docs = await currentDocuments(principalId);
    expect(docs).toHaveLength(2);
    const paths = docs.map((d) => d.path).sort();
    expect(paths).toEqual(["identity", "soul"]);
  });

  test("preserves priority and editedBy", async () => {
    await db.insert(document).values({
      content: "Test",
      editedBy: "principal",
      path: "skills/test",
      principalId,
      priority: 5,
    });

    const docs = await currentDocuments(principalId);
    expect(docs[0]!.priority).toBe(5);
    expect(docs[0]!.updatedBy).toBe("principal");
  });

  test("scoped to principal", async () => {
    await db.insert(document).values({
      content: "My doc",
      editedBy: "user",
      path: "soul",
      principalId,
      priority: 0,
    });

    const other = await seedPrincipal(undefined, { username: "test-other2" });
    const docs = await currentDocuments(other);
    expect(docs).toHaveLength(0);
  });
});
