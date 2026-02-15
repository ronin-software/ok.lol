import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { account } from "@/db/schema";
import { identify } from "@/lib/auth";
import { env } from "@/lib/env";
import { error } from "@/lib/http";
import { createCheckoutSession } from "@/lib/stripe";

const Body = z.object({ dollars: z.number().min(1) });

/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for purchasing credits.
 * Saves the payment method for future off-session charges.
 *
 * Body: { dollars: number }
 * Returns: { url: string }
 */
export async function POST(req: Request) {
  const accountId = await identify();
  if (!accountId) return error(401, "Unauthorized");

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return error(400, "Minimum purchase is $1");
  const { dollars } = parsed.data;

  const acct = await db
    .select({ stripeCustomerId: account.stripeCustomerId })
    .from(account)
    .where(eq(account.id, accountId))
    .then((rows) => rows[0]);
  if (!acct?.stripeCustomerId) return error(404, "Account not found");

  const session = await createCheckoutSession({
    accountId,
    cents: Math.round(dollars * 100),
    customerId: acct.stripeCustomerId,
    successUrl: `${env.BASE_URL}/api/stripe/funded?session_id={CHECKOUT_SESSION_ID}`,
  });

  return Response.json({ url: session.url });
}
