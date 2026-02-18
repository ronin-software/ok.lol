import { db } from "@/db";
import { currentDocuments } from "@/db/documents";
import { hire, listing, principal } from "@/db/schema";
import { assert } from "@/lib/assert";
import { secret } from "@/lib/session";
import { available, lookupAccount } from "@/lib/tigerbeetle";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";

/** A principal's document, resolved from the DB or injected as a system default. */
export type Document = {
  /** Document body. */
  contents: string;
  /** True when this is a system-provided default, not a stored document. */
  default?: boolean;
  /** Hierarchical document path (e.g. "soul", "skills/research"). */
  path: string;
  /** Injection order. Lower values are included first. */
  priority?: number;
  /** ISO timestamp of last edit. Absent on defaults. */
  updatedAt?: string;
  /** Who created this version. Absent on defaults. */
  updatedBy?: "principal" | "user";
};

/**
 * The execution context for capabilities running at the origin.
 *
 * Every execution has a `principal` (the executor) with its full
 * configuration. When executing a hire on behalf of another principal,
 * `caller` identifies the requesting principal. Absent when self-directed.
 */
export type OriginExecutionContext = {
  /** The principal that requested this execution. Absent when self-directed. */
  caller?: {
    /** The calling principal's account */
    accountId: string;
    /** The hire that initiated this execution */
    hireId: string;
    /** Display name */
    name: string;
    /** The calling principal's username */
    username: string;
  };
  /** The principal executing the capability */
  principal: {
    /** The account the principal belongs to */
    accountId: string;
    /** Credit balance at time of call (unit: 1e-6 USD) */
    credits: bigint;
    /** Current documents (includes listing skill when executing a hire) */
    documents: Document[];
    /** The principal's ID */
    id: string;
    /** Display name */
    name: string;
    /** The principal's username */
    username: string;
  };
};

// –
// Resolution
// –

/** JWT payload shape for origin execution. */
type Claims = {
  /** Hire ID, present when executing a listing on behalf of a caller. */
  hireId?: string;
  /** Principal ID (executor). */
  sub: string;
};

/** How the caller was identified. */
type Source =
  | { accountId: string }
  | { jwt: string }
  | { principalId: string };

/**
 * Resolve an OriginExecutionContext from a JWT, session accountId, or
 * a known principalId (e.g. webhook handlers that have already resolved
 * the principal from their own DB query).
 *
 * - `{ jwt }`: verifies the token, extracts principalId + optional hireId.
 * - `{ accountId }`: looks up the principal by owning account.
 * - `{ principalId }`: looks up the principal directly (no hire support).
 *
 * All paths resolve the principal's documents and credit balance.
 * The JWT path additionally supports hire-based execution (caller + skill injection).
 */
export async function getExecutionContext(source: Source): Promise<OriginExecutionContext> {
  let principalId: string | undefined;
  let accountId: string | undefined;
  let hireId: string | undefined;

  if ("jwt" in source) {
    const { payload } = await jwtVerify(source.jwt, secret());
    const claims = payload as unknown as Claims;
    assert(claims.sub, "JWT missing sub claim");
    principalId = claims.sub;
    hireId = claims.hireId;
  } else if ("principalId" in source) {
    principalId = source.principalId;
  } else {
    accountId = source.accountId;
  }

  // Resolve principal by ID or by owning account.
  const [row] = principalId
    ? await db.select().from(principal).where(eq(principal.id, principalId)).limit(1)
    : await db.select().from(principal).where(eq(principal.accountId, accountId!)).limit(1);
  assert(row, principalId ? `Principal not found: ${principalId}` : `No principal for account: ${accountId}`);

  // Resolve documents and credits in parallel.
  const [docs, tbAccount] = await Promise.all([
    currentDocuments(row.id),
    lookupAccount(BigInt(row.accountId)),
  ]);
  const credits = tbAccount ? available(tbAccount) : 0n;

  // Resolve caller if this is a hire execution.
  let caller: OriginExecutionContext["caller"];
  if (hireId) {
    const [hireRow] = await db
      .select()
      .from(hire)
      .where(eq(hire.id, hireId))
      .limit(1);
    assert(hireRow, `Hire not found: ${hireId}`);

    const [callerRow] = await db
      .select()
      .from(principal)
      .where(eq(principal.id, hireRow.callerId))
      .limit(1);
    assert(callerRow, `Caller principal not found: ${hireRow.callerId}`);

    caller = {
      accountId: callerRow.accountId,
      hireId,
      name: callerRow.name,
      username: callerRow.username,
    };

    // Inject listing skill into documents.
    const [listingRow] = await db
      .select()
      .from(listing)
      .where(eq(listing.id, hireRow.listingId))
      .limit(1);
    if (listingRow?.skill) {
      docs.push({
        contents: listingRow.skill,
        path: "skill",
        priority: 100,
        updatedAt: listingRow.updatedAt.toISOString(),
        updatedBy: "user",
      });
    }
  }

  return {
    caller,
    principal: {
      accountId: row.accountId,
      credits,
      documents: docs,
      id: row.id,
      name: row.name,
      username: row.username,
    },
  };
}
