import { desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { account, document, principal, usage as usageTable } from "@/db/schema";
import { verify } from "@/lib/session";
import * as tb from "@/lib/tigerbeetle";
import { CORE_PATHS, withDefaults } from "@/capabilities/_defaults";
import type { DocumentData } from "./document-editor";
import BalanceCard from "./balance-card";
import CreatePal from "./create-pal";
import DocumentsSection from "./document-editor";
import FundedBanner from "./funded-banner";
import PayoutCard from "./payout-card";
import SignOut from "./sign-out";

export default async function Dashboard() {
  const accountId = await verify();
  if (!accountId) redirect("/sign-in");

  const acct = await db
    .select({
      email: account.email,
      stripeConnectId: account.stripeConnectId,
    })
    .from(account)
    .where(eq(account.id, accountId))
    .then((rows) => rows[0]);

  // Stale session — clear cookie to avoid redirect loop.
  if (!acct) redirect("/api/auth/signout");

  const pal = await db
    .select({ id: principal.id, username: principal.username })
    .from(principal)
    .where(eq(principal.accountId, accountId))
    .then((rows) => rows[0]);

  const tbAcct = await tb.lookupAccount(BigInt(accountId));
  const balance = tbAcct ? Number(tb.available(tbAcct)) : 0;

  const recent = await db
    .select({
      amount: usageTable.amount,
      cost: usageTable.cost,
      createdAt: usageTable.createdAt,
      resource: usageTable.resource,
    })
    .from(usageTable)
    .where(eq(usageTable.accountId, accountId))
    .orderBy(desc(usageTable.createdAt))
    .limit(50);

  // Flash cookie set by /api/stripe/funded redirect.
  const jar = await cookies();
  const funded = jar.has("funded");

  // Resolve documents for the pal (with defaults).
  let documents: DocumentData[] = [];
  if (pal) {
    documents = await resolveDocuments(pal.id);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      {funded && <FundedBanner />}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">{acct.email}</p>
        </div>
        <SignOut />
      </div>
      {pal ? (
        <>
          <PalBadge username={pal.username} />
          <BalanceCard balance={balance} />
          <PayoutCard enabled={acct.stripeConnectId != null} />
          <DocumentsSection documents={documents} principalId={pal.id} />
          <UsageTable rows={recent} />
        </>
      ) : (
        <CreatePal />
      )}
    </div>
  );
}

// –
// Documents
// –

/** Resolve documents for a pal, merging with system defaults. */
async function resolveDocuments(principalId: string): Promise<DocumentData[]> {
  const allDocs = await db
    .select()
    .from(document)
    .where(eq(document.principalId, principalId))
    .orderBy(desc(document.createdAt));

  // Deduplicate to latest version per path.
  const seen = new Set<string>();
  const current = allDocs.filter((d) => {
    if (seen.has(d.path)) return false;
    seen.add(d.path);
    return true;
  });

  // Convert to the Document shape expected by withDefaults.
  const mapped = current.map((d) => ({
    contents: d.content,
    path: d.path,
    priority: d.priority,
    updatedAt: d.createdAt.toISOString(),
    updatedBy: d.editedBy,
  }));

  const merged = withDefaults(mapped);

  return merged
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .map((d) => ({
      content: d.contents,
      isDefault: d.default ?? false,
      path: d.path,
      priority: d.priority ?? 0,
    }));
}

// –
// Pal badge
// –

function PalBadge({ username }: { username: string }) {
  return (
    <div
      className={[
        "mt-8 flex items-center gap-3 rounded-xl",
        "border border-zinc-800 bg-zinc-900 px-4 py-3",
      ].join(" ")}
    >
      <div>
        <p className="text-sm font-medium text-white">
          {username}@ok.lol
        </p>
        <p className="text-xs text-zinc-500">
          Your pal can send and receive emails at this address.
        </p>
      </div>
    </div>
  );
}

// –
// Usage table
// –

interface UsageRow {
  amount: bigint;
  cost: bigint;
  createdAt: Date;
  resource: string;
}

function UsageTable({ rows }: { rows: UsageRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="mt-8">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Recent Usage
        </p>
        <p className="mt-4 text-sm text-zinc-500">No usage yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Recent Usage
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
              <th className="pb-3 pr-4 font-medium">Resource</th>
              <th className="pb-3 pr-4 font-medium">Amount</th>
              <th className="pb-3 pr-4 font-medium">Cost</th>
              <th className="pb-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-zinc-800/50">
                <td className="py-3 pr-4 font-mono text-xs">{row.resource}</td>
                <td className="py-3 pr-4 tabular-nums">
                  {Number(row.amount).toLocaleString()}
                </td>
                <td className="py-3 pr-4 tabular-nums">
                  ${(Number(row.cost) / 1_000_000).toFixed(4)}
                </td>
                <td className="py-3 text-zinc-500">
                  {row.createdAt.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
