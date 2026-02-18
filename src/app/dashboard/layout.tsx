import { db } from "@/db";
import { account, principal } from "@/db/schema";
import { env } from "@/lib/env";
import { verify } from "@/lib/session";
import * as tb from "@/lib/tigerbeetle";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Shell from "./shell";

/** Dashboard shell: sidebar, credits badge, pal switcher. */
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  // Pal may be null during onboarding.
  const pal = await db
    .select({
      id: principal.id,
      name: principal.name,
      username: principal.username,
    })
    .from(principal)
    .where(eq(principal.accountId, accountId))
    .then((rows) => rows[0] ?? null);

  let balance = 0;
  if (pal) {
    const tbAcct = await tb.lookupAccount(BigInt(accountId));
    balance = tbAcct ? Number(tb.available(tbAcct)) : 0;
  }

  return (
    <Shell
      balance={balance}
      domain={env.EMAIL_DOMAIN}
      pal={pal ? { name: pal.name, username: pal.username } : null}
      payoutsEnabled={acct.stripeConnectId != null}
    >
      {children}
    </Shell>
  );
}
