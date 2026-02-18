import * as tb from "@/lib/tigerbeetle";
import { cookies } from "next/headers";
import { requirePrincipal } from "../auth";
import BalanceCard from "../balance-card";
import FundedBanner from "../funded-banner";
import PayoutCard from "../payout-card";
import { CARD, LABEL } from "../styles";

export default async function SettingsPage() {
  const { accountId, stripeConnectId } = await requirePrincipal();

  const tbAcct = await tb.lookupAccount(BigInt(accountId));
  const balance = tbAcct ? Number(tb.available(tbAcct)) : 0;

  const jar = await cookies();
  const funded = jar.has("funded");

  return (
    <div className="mx-auto max-w-2xl px-4">
      {funded && (
        <div className="mt-6">
          <FundedBanner />
        </div>
      )}
      <BalanceCard balance={balance} />
      <PayoutCard enabled={stripeConnectId != null} />

      {/* Integrations stub */}
      <div className={CARD}>
        <p className={LABEL}>Integrations</p>
        <p className="mt-2 text-sm text-zinc-500">
          OAuth integrations coming soon.
        </p>
      </div>
    </div>
  );
}
