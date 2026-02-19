import { db } from "@/db";
import { account } from "@/db/schema";
import { env } from "@/lib/env";
import { error } from "@/lib/http";
import { verify } from "@/lib/session";
import { createSetupSession } from "@/lib/stripe";
import { eq } from "drizzle-orm";

/**
 * POST /api/stripe/update-card
 *
 * Creates a Stripe Checkout Session in setup mode so the user
 * can replace their saved payment method.
 *
 * Returns: { url: string }
 */
export async function POST() {
  const accountId = await verify();
  if (!accountId) return error(401, "Unauthorized");

  const acct = await db
    .select({ stripeCustomerId: account.stripeCustomerId })
    .from(account)
    .where(eq(account.id, accountId))
    .then((rows) => rows[0]);
  if (!acct?.stripeCustomerId) return error(404, "No payment method on file");

  const session = await createSetupSession({
    customerId: acct.stripeCustomerId,
    successUrl: `${env.BASE_URL}/dashboard/more`,
  });

  return Response.json({ url: session.url });
}
