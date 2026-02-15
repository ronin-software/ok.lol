import { NextResponse } from "next/server";
import { db } from "@/db";
import { principal } from "@/db/schema";
import { centsToMicro, stripe } from "@/lib/stripe";
import * as tb from "@/lib/tigerbeetle";

/**
 * GET /api/stripe/funded?session_id=cs_...
 *
 * Stripe checkout success redirect. Retrieves the session,
 * fulfills the payment (fund + pal creation), and redirects
 * to the dashboard with a flash cookie.
 *
 * Idempotent alongside the webhook handler.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");

  if (sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const accountId = session.metadata?.accountId;
      const cents = Number(session.metadata?.cents ?? "0");

      // Fund the TigerBeetle account.
      if (accountId && cents > 0) {
        await tb.bootstrap();
        await tb.fund(BigInt(accountId), centsToMicro(cents));
      }

      // Create principal if this was a pal registration.
      const username = session.metadata?.username;
      if (accountId && username) {
        await db
          .insert(principal)
          .values({ accountId, username })
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
