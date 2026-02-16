import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { account, principal } from "@/db/schema";
import { env } from "@/lib/env";
import { error } from "@/lib/http";
import { verify } from "@/lib/session";
import { createCheckoutSession } from "@/lib/stripe";

/** Pal registration costs $20, credited to the account balance. */
const REGISTRATION_CENTS = 2000;

/** Principal usernames that cannot be used */
const RESERVED = new Set(["www"]);

/** Pattern for principal username validation */
const USERNAME_RE = /^[a-z][a-z0-9_-]*$/;


/** Schema for requests to POST /api/pal */
const RequestBodySchema = z.object({ username: z.string().min(1) });

/**
 * POST /api/pal
 *
 * Validates a username and creates a Stripe Checkout Session
 * for $20. The webhook creates the principal row and funds the
 * account on successful payment.
 *
 * Body: { username: string }
 * Returns: { url: string }
 */
export async function POST(req: Request) {
  const accountId = await verify();
  if (!accountId) return error(401, "Unauthorized");

  const parsed = RequestBodySchema.safeParse(await req.json());
  if (!parsed.success) return error(400, "Missing username");
  const { username } = parsed.data;

  const name = username.toLowerCase().trim();
  if (name.length < 4) {
    return error(400, "Username must be at least 4 characters");
  }
  if (!USERNAME_RE.test(name)) {
    return error(
      400,
      "Username must start with a letter and contain only lowercase letters, numbers, hyphens, and underscores",
    );
  }
  if (RESERVED.has(name)) {
    return error(400, "Username is reserved");
  }

  // Check uniqueness.
  const existing = await db
    .select({ id: principal.id })
    .from(principal)
    .where(eq(principal.username, name))
    .then((rows) => rows[0]);
  if (existing) return error(409, "Username already taken");

  // Check the account doesn't already have a pal.
  const owned = await db
    .select({ id: principal.id })
    .from(principal)
    .where(eq(principal.accountId, accountId))
    .then((rows) => rows[0]);
  if (owned) return error(409, "Account already has a pal");

  const acct = await db
    .select({ stripeCustomerId: account.stripeCustomerId })
    .from(account)
    .where(eq(account.id, accountId))
    .then((rows) => rows[0]);
  if (!acct?.stripeCustomerId) return error(404, "Account not found");

  const session = await createCheckoutSession({
    accountId,
    cents: REGISTRATION_CENTS,
    customerId: acct.stripeCustomerId,
    metadata: { username: name },
    successUrl: `${env.BASE_URL}/api/stripe/funded?session_id={CHECKOUT_SESSION_ID}`,
  });

  return Response.json({ url: session.url });
}
