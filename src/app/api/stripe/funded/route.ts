import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { seedOwnerContact } from "@/db/contacts";
import { account, principal } from "@/db/schema";
import { verify } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { eq } from "drizzle-orm";

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
 *
 * Mobile-originated flows (platform=mobile cookie) redirect to
 * /open so the user lands back in the native app.
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
      const sessionAccountId = session.metadata?.accountId;

      // Create principal if this was a pal registration.
      const username = session.metadata?.username;
      const name = session.metadata?.name;
      if (sessionAccountId === accountId && username && name) {
        const [inserted] = await db
          .insert(principal)
          .values({ accountId, name, username })
          .onConflictDoNothing()
          .returning({ id: principal.id });

        // Seed the owner contact so the principal can reach its account holder.
        if (inserted) {
          const [acc] = await db
            .select({ email: account.email, name: account.name })
            .from(account)
            .where(eq(account.id, accountId))
            .limit(1);
          if (acc) {
            await seedOwnerContact(inserted.id, acc.email, acc.name);
          }
        }
      }
    } catch (err) {
      console.error("Funded redirect fulfillment failed:", err);
    }
  }

  // Mobile-originated flows redirect to the app deep-link page.
  const jar = await cookies();
  const mobile = jar.get("platform")?.value === "mobile";

  const destination = mobile ? "/open" : "/dashboard";
  const res = NextResponse.redirect(`${url.origin}${destination}`);
  res.cookies.set("funded", "1", { maxAge: 30, path: "/" });

  // Clear the platform cookie — it's been consumed.
  if (mobile) {
    res.cookies.delete("platform");
  }

  return res;
}
