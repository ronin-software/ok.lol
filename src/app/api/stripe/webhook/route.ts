import { db } from "@/db";
import { account } from "@/db/schema";
import { seedPrincipal } from "@/lib/accounts";
import { env } from "@/lib/env";
import { centsToMicro, stripe } from "@/lib/stripe";
import * as tb from "@/lib/tigerbeetle";
import { eq } from "drizzle-orm";

/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events:
 * - checkout.session.completed — funding credits (+ principal creation for pal registration)
 * - payment_intent.succeeded — auto-top-up charges
 * - account.updated — Connect onboarding completion
 */
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const accountId = session.metadata?.accountId;
    const cents = Number(session.metadata?.cents ?? "0");
    if (!accountId) return new Response("Missing accountId", { status: 400 });
    if (!cents) return new Response("Missing cents", { status: 400 });

    await tb.bootstrap();
    await tb.fund(BigInt(accountId), centsToMicro(cents));

    const { username, name } = session.metadata ?? {};
    if (username && name) await seedPrincipal(accountId, username, name);
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const accountId = intent.metadata?.accountId;
    if (intent.metadata?.auto_topup !== "true") return new Response("ok");
    if (!accountId) return new Response("ok");
    await tb.fund(BigInt(accountId), centsToMicro(intent.amount ?? 0));
  }

  if (event.type === "account.updated") {
    const connectAccount = event.data.object;
    if (connectAccount.payouts_enabled) {
      await db
        .update(account)
        .set({ stripeConnectId: connectAccount.id })
        .where(eq(account.stripeConnectId, connectAccount.id));
    }
  }

  return new Response("ok");
}
