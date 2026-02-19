import { db } from "@/db";
import { log, usage as usageTable } from "@/db/schema";
import { getCardSummary } from "@/lib/stripe";
import * as tb from "@/lib/tigerbeetle";
import { desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import ActivityTable, { type ActivityEntry } from "../activity";
import { requirePrincipal } from "../auth";
import BalanceCard from "../balance-card";
import BillingCard from "../billing-card";
import FundedBanner from "../funded-banner";
import PayoutCard from "../payout-card";
import { BUTTON_PRIMARY, CARD, INPUT, LABEL } from "../styles";
import { updatePalName } from "./actions";

const PREVIEW = 5;

export default async function MorePage() {
  const {
    accountId,
    autoReloadTarget,
    autoReloadThreshold,
    monthlySpendLimit,
    pal,
    stripeConnectId,
    stripeCustomerId,
  } = await requirePrincipal();

  const [tbAcct, logRows, usageRows, jar, card] = await Promise.all([
    tb.lookupAccount(BigInt(accountId)),
    db
      .select({ capability: log.capability, createdAt: log.createdAt, input: log.input })
      .from(log)
      .where(eq(log.principalId, pal.id))
      .orderBy(desc(log.createdAt))
      .limit(PREVIEW),
    db
      .select({ amount: usageTable.amount, cost: usageTable.cost, createdAt: usageTable.createdAt, resource: usageTable.resource })
      .from(usageTable)
      .where(eq(usageTable.accountId, accountId))
      .orderBy(desc(usageTable.createdAt))
      .limit(PREVIEW),
    cookies(),
    stripeCustomerId ? getCardSummary(stripeCustomerId) : Promise.resolve(null),
  ]);

  const balance = tbAcct ? Number(tb.available(tbAcct)) : 0;
  const funded = jar.has("funded");

  const activity: ActivityEntry[] = [
    ...logRows.map((r) => ({ capability: r.capability, createdAt: r.createdAt.toISOString(), input: r.input, kind: "log" as const })),
    ...usageRows.map((r) => ({ cost: Number(r.cost) / 1_000_000, createdAt: r.createdAt.toISOString(), detail: `${Number(r.amount).toLocaleString()} tokens`, kind: "usage" as const, resource: r.resource })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, PREVIEW);

  return (
    <div className="mx-auto max-w-2xl px-4">
      {funded && (
        <div className="mt-6">
          <FundedBanner />
        </div>
      )}
      {/* Pal identity */}
      <div className={CARD}>
        <p className={LABEL}>Pal Name</p>
        <p className="mt-2 text-sm text-zinc-400">
          Your pal&rsquo;s display name — how it introduces itself and signs messages.
        </p>
        <form action={updatePalName} className="mt-4 flex gap-2">
          <input name="name" defaultValue={pal.name} className={INPUT} placeholder="Display name" required />
          <button type="submit" className={BUTTON_PRIMARY}>Rename</button>
        </form>
        <p className="mt-3 text-xs text-zinc-500">
          After renaming, check your pal's documents for references to the old name.
        </p>
      </div>

      <BalanceCard balance={balance} />
      <BillingCard
        card={card}
        threshold={Number(autoReloadThreshold) / 1_000_000}
        target={Number(autoReloadTarget) / 1_000_000}
        limit={Number(monthlySpendLimit) / 1_000_000}
      />
      <PayoutCard enabled={stripeConnectId != null} />

      {/* Integrations stub */}
      <div className={CARD}>
        <p className={LABEL}>Integrations</p>
        <p className="mt-2 text-sm text-zinc-500">OAuth integrations coming soon.</p>
      </div>

      {/* Recent activity */}
      <ActivityTable rows={activity} />
      {activity.length > 0 && (
        <div className="mt-4 pb-8 text-right">
          <Link
            href="/dashboard/activity"
            className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Show all →
          </Link>
        </div>
      )}
    </div>
  );
}
