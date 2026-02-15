import { eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { identify } from "@/lib/auth";
import { env } from "@/lib/env";
import { error } from "@/lib/http";
import {
  createAccountLink,
  createConnectAccount,
  getConnectStatus,
} from "@/lib/stripe";

/**
 * POST /api/connect/onboard
 *
 * Starts or resumes Stripe Connect Express onboarding.
 * If already onboarded, returns `{ enabled: true }`.
 * Otherwise returns `{ url }` pointing to Stripe's hosted onboarding.
 */
export async function POST() {
  const accountId = await identify();
  if (!accountId) return error(401, "Unauthorized");

  const acct = await db
    .select({
      email: account.email,
      stripeConnectId: account.stripeConnectId,
    })
    .from(account)
    .where(eq(account.id, accountId))
    .then((rows) => rows[0]);
  if (!acct) return error(404, "Account not found");

  // –
  // Resume existing Connect account
  // –

  if (acct.stripeConnectId) {
    const enabled = await getConnectStatus(acct.stripeConnectId);
    if (enabled) return Response.json({ enabled: true });

    const url = await createAccountLink(
      acct.stripeConnectId,
      `${env.BASE_URL}/dashboard?connect=refresh`,
      `${env.BASE_URL}/dashboard?connect=complete`,
    );
    return Response.json({ enabled: false, url });
  }

  // –
  // Create new Connect account
  // –

  const connectId = await createConnectAccount(acct.email, accountId);

  await db
    .update(account)
    .set({ stripeConnectId: connectId })
    .where(eq(account.id, accountId));

  const url = await createAccountLink(
    connectId,
    `${env.BASE_URL}/dashboard?connect=refresh`,
    `${env.BASE_URL}/dashboard?connect=complete`,
  );

  return Response.json({ enabled: false, url });
}
