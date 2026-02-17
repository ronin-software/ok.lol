import { NextResponse } from "next/server";
import { db } from "@/db";
import { principal } from "@/db/schema";
import { verify } from "@/lib/session";
import { stripe } from "@/lib/stripe";

/**
 * GET /api/stripe/funded?session_id=cs_...
 *
 * Stripe checkout success redirect. Creates the principal if this
 * was a pal registration (idempotent via onConflictDoNothing) and
 * redirects to the dashboard with a flash cookie.
 *
 * Funding is handled exclusively by the webhook to prevent
 * double-crediting. The principal creation is safe to run from
 * both paths because it's a no-op on conflict.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  // Auth check: only the session owner should trigger fulfillment.
  const accountId = await verify();
  if (!accountId) {
    return NextResponse.redirect(`${url.origin}/sign-in`);
  }

  const sessionId = url.searchParams.get("session_id");

  if (sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const sessionAccountId = session.metadata?.accountId;

      // Create principal if this was a pal registration.
      const username = session.metadata?.username;
      const name = session.metadata?.name;
      if (sessionAccountId === accountId && username && name) {
        await db
          .insert(principal)
          .values({ accountId, name, username })
          .onConflictDoNothing();
      }
    } catch (err) {
      console.error("Funded redirect fulfillment failed:", err);
    }
  }

  const res = NextResponse.redirect(`${url.origin}/dashboard`);
  res.cookies.set("funded", "1", { maxAge: 30, path: "/" });
  return res;
}
