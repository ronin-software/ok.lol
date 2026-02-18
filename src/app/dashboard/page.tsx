import { withDefaults } from "@/capabilities/documents/defaults";
import { db } from "@/db";
import { currentDocuments } from "@/db/documents";
import { account, log, principal, usage as usageTable, worker } from "@/db/schema";
import { env } from "@/lib/env";
import { verify } from "@/lib/session";
import * as tb from "@/lib/tigerbeetle";
import { desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { probeWorkers } from "./actions";
import ActivityTable, { type ActivityEntry } from "./activity";
import BalanceCard from "./balance-card";
import CreatePal from "./create-pal";
import type { DocumentData } from "./document-editor";
import DocumentsSection from "./document-editor";
import FundedBanner from "./funded-banner";
import PalBadge from "./pal-badge";
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

  if (!acct) redirect("/api/auth/signout");

  const pal = await db
    .select({ id: principal.id, name: principal.name, username: principal.username })
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

  const jar = await cookies();
  const funded = jar.has("funded");

  let documents: DocumentData[] = [];
  if (pal) {
    documents = await resolveDocuments(pal.id);
  }

  const [workerRows, probeNames] = await Promise.all([
    db
      .select({
        createdAt: worker.createdAt,
        id: worker.id,
        name: worker.name,
        secret: worker.secret,
        url: worker.url,
      })
      .from(worker)
      .where(eq(worker.accountId, accountId))
      .orderBy(desc(worker.createdAt)),
    probeWorkers(),
  ]);

  const workerData = workerRows.map((w) => ({
    ...w,
    createdAt: w.createdAt.toISOString(),
    name: probeNames[w.id] ?? w.name,
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
          <PalBadge name={pal.name} username={pal.username} />
          <Link
            href="/chat"
            className={[
              "mt-6 flex items-center justify-center rounded-xl",
              "border border-zinc-700 bg-zinc-900 px-4 py-3",
              "text-sm font-medium text-white transition-colors",
              "hover:border-zinc-500 hover:bg-zinc-800",
            ].join(" ")}
          >
            Chat with {pal.name}
          </Link>
          <BalanceCard balance={balance} />
          <PayoutCard enabled={acct.stripeConnectId != null} />
          <Workers workers={workerData} />
          <DocumentsSection documents={documents} principalId={pal.id} />
          <ActivityTable rows={activity} />
        </>
      ) : (
        <CreatePal domain={env.EMAIL_DOMAIN} />
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
