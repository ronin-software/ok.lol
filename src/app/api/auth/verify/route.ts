import { eq } from "drizzle-orm";
import { db } from "@/db";
import { account, principal } from "@/db/schema";
import { verifyToken } from "@/lib/auth";
import { create as createSession } from "@/lib/session";
import { createCustomer, stripe } from "@/lib/stripe";
import { id as tbId } from "@/lib/tigerbeetle";
import * as tb from "@/lib/tigerbeetle";

/** Platform cookie — tells downstream routes (checkout, funded) to deep-link. */
const PLATFORM_COOKIE = "platform";
const PLATFORM_MAX_AGE = 3600;
const SECURE = process.env.NODE_ENV === "production";

/**
 * GET /api/auth/verify?token=<jwt>
 *
 * Verify a magic link, upsert the account, set a session cookie,
 * and redirect. Mobile-originated links set a `platform=mobile`
 * cookie so checkout/funded routes redirect back to the app.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return redirect(url.origin, "/sign-in");

  const payload = await verifyToken(token);
  if (!payload) return redirect(url.origin, "/sign-in");

  const accountId = await upsertAccount(payload.email);
  if (!accountId) return redirect(url.origin, "/sign-in");

  // Build response with session cookie.
  const headers = new Headers();
  headers.append("Set-Cookie", await createSession(accountId));

  // Mobile-originated: deep-link if account is ready, otherwise web onboarding.
  if (payload.from === "mobile") {
    const pal = await db
      .select({ id: principal.id })
      .from(principal)
      .where(eq(principal.accountId, accountId))
      .then((rows) => rows[0]);

    if (pal) {
      headers.set("Location", `${url.origin}/open`);
      return new Response(null, { headers, status: 302 });
    }

    // Persist platform hint for the checkout → funded → deep-link chain.
    headers.append("Set-Cookie", platformCookie());
  }

  headers.set("Location", `${url.origin}/dashboard`);
  return new Response(null, { headers, status: 302 });
}

// –
// Account upsert
// –

/**
 * Find or create an account for the given email.
 * Returns the account ID, or null on unrecoverable failure.
 */
async function upsertAccount(email: string): Promise<string | null> {
  // Existing account?
  const existing = await db
    .select({ id: account.id })
    .from(account)
    .where(eq(account.email, email))
    .then((rows) => rows[0]);
  if (existing) return existing.id;

  // Create Stripe customer + account row + TigerBeetle ledger entry.
  const accountId = String(tbId());
  let stripeCustomerId: string;
  try {
    stripeCustomerId = await createCustomer(email, accountId);
  } catch (err) {
    console.error("[auth/verify] Stripe customer creation failed:", err);
    return null;
  }

  try {
    await db.insert(account).values({
      email,
      id: accountId,
      stripeCustomerId,
    });
  } catch {
    // Race condition — another request created the account.
    await stripe.customers.del(stripeCustomerId).catch(logError);
    const raced = await db
      .select({ id: account.id })
      .from(account)
      .where(eq(account.email, email))
      .then((rows) => rows[0]);
    return raced?.id ?? null;
  }

  try {
    await tb.bootstrap();
    await tb.createAccount(BigInt(accountId));
  } catch (err) {
    console.error("[auth/verify] TigerBeetle account creation failed:", err);
    await db.delete(account).where(eq(account.id, accountId)).catch(logError);
    await stripe.customers.del(stripeCustomerId).catch(logError);
    return null;
  }

  return accountId;
}

// –
// Helpers
// –

function platformCookie(): string {
  const parts = [
    `${PLATFORM_COOKIE}=mobile`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${PLATFORM_MAX_AGE}`,
  ];
  if (SECURE) parts.push("Secure");
  return parts.join("; ");
}

function redirect(origin: string, path: string) {
  return new Response(null, {
    headers: { Location: `${origin}${path}` },
    status: 302,
  });
}

function logError(err: unknown) {
  console.error("[auth/verify] Rollback failed:", err);
}
