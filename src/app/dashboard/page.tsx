import { withDefaults } from "@/capabilities/_defaults";
import { db } from "@/db";
import { account, document, log, principal, usage as usageTable } from "@/db/schema";
import { verify } from "@/lib/session";
import * as tb from "@/lib/tigerbeetle";
import { desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BalanceCard from "./balance-card";
import CreatePal from "./create-pal";
import type { DocumentData } from "./document-editor";
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

  // Fetch logs and usage in parallel, then merge into a single timeline.
  const [logRows, usageRows] = pal
    ? await Promise.all([
        db
          .select({
            capability: log.capability,
            createdAt: log.createdAt,
            input: log.input,
          })
          .from(log)
          .where(eq(log.principalId, pal.id))
          .orderBy(desc(log.createdAt))
          .limit(50),
        db
          .select({
            amount: usageTable.amount,
            cost: usageTable.cost,
            createdAt: usageTable.createdAt,
            resource: usageTable.resource,
          })
          .from(usageTable)
          .where(eq(usageTable.accountId, accountId))
          .orderBy(desc(usageTable.createdAt))
          .limit(50),
      ])
    : [[], []];

  const activity: ActivityEntry[] = [
    ...logRows.map(
      (r) => ({ capability: r.capability, createdAt: r.createdAt, input: r.input, kind: "log" }) as const,
    ),
    ...usageRows.map(
      (r) => ({ amount: r.amount, cost: r.cost, createdAt: r.createdAt, kind: "usage", resource: r.resource }) as const,
    ),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

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
          <ActivityTable rows={activity} />
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
// Activity
// –

type ActivityEntry =
  | { capability: string; createdAt: Date; input: unknown; kind: "log" }
  | { amount: bigint; cost: bigint; createdAt: Date; kind: "usage"; resource: string };

/** Collapse capability input to a short human-readable summary. */
function summarize(input: unknown): string {
  if (input == null) return "";
  if (typeof input !== "object") return String(input);
  const obj = input as Record<string, unknown>;
  if (typeof obj.prompt === "string") {
    return obj.prompt.length > 120 ? obj.prompt.slice(0, 120) + "\u2026" : obj.prompt;
  }
  if (typeof obj.to === "string" && typeof obj.subject === "string") {
    return `to ${obj.to}: ${obj.subject}`;
  }
  if (typeof obj.from === "string" && typeof obj.subject === "string") {
    return `from ${obj.from}: ${obj.subject}`;
  }
  return JSON.stringify(input).slice(0, 120);
}

function ActivityTable({ rows }: { rows: ActivityEntry[] }) {
  if (rows.length === 0) {
    return (
      <div className="mt-8">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Activity
        </p>
        <p className="mt-4 text-sm text-zinc-500">No activity yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Activity
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
              <th className="pb-3 pr-4 font-medium">Event</th>
              <th className="pb-3 pr-4 font-medium">Detail</th>
              <th className="pb-3 pr-4 font-medium">Cost</th>
              <th className="pb-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) =>
              row.kind === "log" ? (
                <tr key={i} className="border-b border-zinc-800/50">
                  <td className="py-3 pr-4 font-mono text-xs">{row.capability}</td>
                  <td className="max-w-sm truncate py-3 pr-4 text-zinc-400">
                    {summarize(row.input)}
                  </td>
                  <td className="py-3 pr-4" />
                  <td className="py-3 whitespace-nowrap text-zinc-500">
                    {row.createdAt.toLocaleString()}
                  </td>
                </tr>
              ) : (
                <tr key={i} className="border-b border-zinc-800/50">
                  <td className="py-3 pr-4 font-mono text-xs">{row.resource}</td>
                  <td className="py-3 pr-4 tabular-nums text-zinc-400">
                    {Number(row.amount).toLocaleString()} tokens
                  </td>
                  <td className="py-3 pr-4 tabular-nums">
                    ${(Number(row.cost) / 1_000_000).toFixed(4)}
                  </td>
                  <td className="py-3 whitespace-nowrap text-zinc-500">
                    {row.createdAt.toLocaleString()}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
