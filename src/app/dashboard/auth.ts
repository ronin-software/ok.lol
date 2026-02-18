import { db } from "@/db";
import { account, principal } from "@/db/schema";
import { verify } from "@/lib/session";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

// –
// Account
// –

/** Require an authenticated session. Redirects to sign-in otherwise. */
export async function requireAccount() {
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

  return { accountId, ...acct };
}

// –
// Principal
// –

/** Require auth + an active pal. Redirects to onboard if no pal exists. */
export async function requirePrincipal() {
  const acct = await requireAccount();

  const pal = await db
    .select({
      id: principal.id,
      name: principal.name,
      username: principal.username,
    })
    .from(principal)
    .where(eq(principal.accountId, acct.accountId))
    .then((rows) => rows[0]);

  if (!pal) redirect("/dashboard/onboard");

  return { ...acct, pal };
}
