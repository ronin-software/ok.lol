import { withDefaults } from "@/capabilities/_defaults";
import { db } from "@/db";
import { currentDocuments } from "@/db/documents";
import { account, log, principal, usage as usageTable, worker } from "@/db/schema";
import { verify } from "@/lib/session";
import * as tb from "@/lib/tigerbeetle";
import { desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import BalanceCard from "./balance-card";
import CreatePal from "./create-pal";
import type { DocumentData } from "./document-editor";
import DocumentsSection from "./document-editor";
import FundedBanner from "./funded-banner";
import PayoutCard from "./payout-card";
import SignOut from "./sign-out";
import Workers from "./workers";

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
      (r) => ({
        capability: r.capability,
        createdAt: r.createdAt.toISOString(),
        input: r.input,
        kind: "log",
      }) as const,
    ),
    ...usageRows.map(
      (r) => ({
        cost: Number(r.cost) / 1_000_000,
        createdAt: r.createdAt.toISOString(),
        detail: `${Number(r.amount).toLocaleString()} tokens`,
        kind: "usage",
        resource: r.resource,
      }) as const,
    ),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Flash cookie set by /api/stripe/funded redirect.
  const jar = await cookies();
  const funded = jar.has("funded");

  // Resolve documents for the pal (with defaults).
  let documents: DocumentData[] = [];
  if (pal) {
    documents = await resolveDocuments(pal.id);
  }

  // Fetch registered workers for the account.
  const workerRows = await db
    .select({
      createdAt: worker.createdAt,
      id: worker.id,
      name: worker.name,
      secret: worker.secret,
      url: worker.url,
    })
    .from(worker)
    .where(eq(worker.accountId, accountId))
    .orderBy(desc(worker.createdAt));

  const workerData = workerRows.map((w) => ({
    ...w,
    createdAt: w.createdAt.toISOString(),
  }));

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
          <Link
            href="/chat"
            className={[
              "mt-6 flex items-center justify-center rounded-xl",
              "border border-zinc-700 bg-zinc-900 px-4 py-3",
              "text-sm font-medium text-white transition-colors",
              "hover:border-zinc-500 hover:bg-zinc-800",
            ].join(" ")}
          >
            Chat with {pal.username}
          </Link>
          <BalanceCard balance={balance} />
          <PayoutCard enabled={acct.stripeConnectId != null} />
          <Workers workers={workerData} />
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
  const docs = await currentDocuments(principalId);
  const merged = withDefaults(docs);

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
  | { capability: string; createdAt: string; input: unknown; kind: "log" }
  | { cost: number; createdAt: string; detail: string; kind: "usage"; resource: string };

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

/** Format an ISO timestamp for display. Uses UTC to avoid hydration mismatch. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
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
      <ul className="mt-4 space-y-1">
        {rows.map((row, i) => (
          <li
            key={i}
            className="flex items-baseline justify-between gap-4 py-2 border-b border-zinc-800/50 text-sm"
          >
            <div className="min-w-0 flex-1">
              <span className="font-mono text-xs text-zinc-300">
                {row.kind === "log" ? row.capability : row.resource}
              </span>
              <span className="ml-2 text-zinc-500 truncate">
                {row.kind === "log" ? summarize(row.input) : row.detail}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
              {row.kind === "usage" && (
                <span className="tabular-nums">${row.cost.toFixed(4)}</span>
              )}
              <time dateTime={row.createdAt}>{formatTime(row.createdAt)}</time>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
