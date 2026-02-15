import { db } from "@/db";
import { document, hire, listing, principal } from "@/db/schema";
import { secret } from "@/lib/session";
import { available, lookupAccount } from "@/lib/tigerbeetle";
import { desc, eq } from "drizzle-orm";
import { jwtVerify } from "jose";

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
    documents: {
      contents: string;
      /** Hierarchical document path (e.g. "soul", "skills/research") */
      path: string;
      updatedAt: string;
      updatedBy: 'principal' | 'user';
    }[];
    /** The principal's username */
    username: string;
  };
};

// –
// Resolution
// –

/** JWT payload shape for origin execution */
type Claims = {
  /** Principal ID (executor) */
  sub: string;
  /** Hire ID, present when executing a listing on behalf of a caller */
  hireId?: string;
};

/**
 * Resolves the full OriginExecutionContext from a JWT.
 *
 * 1. Verify JWT, extract sub (principal ID) and optional hireId
 * 2. Look up principal + account from DB
 * 3. Look up principal's documents
 * 4. Look up available credits from TigerBeetle
 * 5. If hireId: resolve caller from hire record, inject listing skill
 */
export async function getExecutionContext(jwt: string): Promise<OriginExecutionContext> {
  // Verify and extract claims
  const { payload } = await jwtVerify(jwt, secret());
  const claims = payload as unknown as Claims;
  if (!claims.sub) throw new Error("JWT missing sub claim");

  // Resolve principal
  const [row] = await db
    .select()
    .from(principal)
    .where(eq(principal.id, claims.sub))
    .limit(1);
  if (!row) throw new Error(`Principal not found: ${claims.sub}`);

  // Resolve documents (latest version per kind)
  const allDocs = await db
    .select()
    .from(document)
    .where(eq(document.principalId, row.id))
    .orderBy(desc(document.createdAt));

  const seen = new Set<string>();
  const currentDocs = allDocs.filter((d) => {
    if (seen.has(d.path)) return false;
    seen.add(d.path);
    return true;
  });

  // Resolve credits from TigerBeetle
  const tbAccount = await lookupAccount(BigInt(row.accountId));
  const credits = tbAccount ? available(tbAccount) : 0n;

  // Build base documents
  const contextDocs = currentDocs.map((d) => ({
    contents: d.content,
    path: d.path,
    updatedAt: d.createdAt.toISOString(),
    updatedBy: d.editedBy,
  }));

  // Resolve caller if this is a hire execution
  let caller: OriginExecutionContext["caller"];
  if (claims.hireId) {
    const [hireRow] = await db
      .select()
      .from(hire)
      .where(eq(hire.id, claims.hireId))
      .limit(1);
    if (!hireRow) throw new Error(`Hire not found: ${claims.hireId}`);

    // Resolve caller principal
    const [callerRow] = await db
      .select()
      .from(principal)
      .where(eq(principal.id, hireRow.callerId))
      .limit(1);
    if (!callerRow) throw new Error(`Caller principal not found: ${hireRow.callerId}`);

    caller = {
      accountId: callerRow.accountId,
      hireId: claims.hireId,
      username: callerRow.username,
    };

    // Inject listing skill into documents
    const [listingRow] = await db
      .select()
      .from(listing)
      .where(eq(listing.id, hireRow.listingId))
      .limit(1);
    if (listingRow?.skill) {
      contextDocs.push({
        contents: listingRow.skill,
        path: "skill",
        updatedAt: listingRow.updatedAt.toISOString(),
        updatedBy: "user" as const,
      });
    }
  }

  return {
    caller,
    principal: {
      accountId: row.accountId,
      credits,
      documents: contextDocs,
      username: row.username,
    },
  };
}
