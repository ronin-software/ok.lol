import { seedPrincipal } from "@/lib/accounts";
import { verify } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * GET /api/stripe/funded?session_id=cs_...
 *
 * Stripe checkout success redirect. Creates the principal if this was a pal
 * registration (idempotent — webhook handles actual funding) and redirects
 * with a flash cookie.
 *
 * Mobile-originated flows (platform=mobile cookie) redirect to /open so
 * the user lands back in the native app.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const accountId = await verify();
  if (!accountId) {
    return NextResponse.redirect(`${url.origin}/sign-in`);
  }

  const sessionId = url.searchParams.get("session_id");
  if (sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const { username, name } = session.metadata ?? {};
      if (session.metadata?.accountId === accountId && username && name) {
        await seedPrincipal(accountId, username, name);
      }
    } catch (err) {
      console.error("Funded redirect fulfillment failed:", err);
    }
  }

  const jar = await cookies();
  const mobile = jar.get("platform")?.value === "mobile";

  const res = NextResponse.redirect(`${url.origin}${mobile ? "/open" : "/dashboard"}`);
  res.cookies.set("funded", "1", { maxAge: 30, path: "/" });
  if (mobile) res.cookies.delete("platform");

  return res;
}
