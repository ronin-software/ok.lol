import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { account } from "@/db/schema";
import { hash } from "@/lib/auth";
import { error as httpError } from "@/lib/http";
import { create as createSession } from "@/lib/session";
import { createCustomer, stripe } from "@/lib/stripe";
import { id as tbId } from "@/lib/tigerbeetle";
import * as tb from "@/lib/tigerbeetle";

const Body = z.object({
  email: z.email(),
  password: z.string().min(8),
});

/**
 * POST /api/auth/signup
 *
 * Creates an account, Stripe Customer, and TigerBeetle ledger entry.
 * Sets a session cookie on success.
 *
 * Body: { email: string, password: string }
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return error("Missing or invalid email/password");
  const { email, password } = parsed.data;

  const accountId = String(tbId());
  const passwordHash = await hash(password);

  // Create Stripe customer.
  let stripeCustomerId: string;
  try {
    stripeCustomerId = await createCustomer(email, accountId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return error(`Stripe error: ${msg}`);
  }

  // Persist account row.
  try {
    await db.insert(account).values({
      email,
      id: accountId,
      passwordHash,
      stripeCustomerId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Roll back orphaned Stripe customer.
    await stripe.customers.del(stripeCustomerId).catch(logRollback);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return error("Email already registered");
    }
    return error(`Database error: ${msg}`);
  }

  // Create TigerBeetle ledger account.
  try {
    await tb.bootstrap();
    await tb.createAccount(BigInt(accountId));
  } catch (err) {
    // Roll back Postgres and Stripe.
    await db.delete(account).where(eq(account.id, accountId)).catch(logRollback);
    await stripe.customers.del(stripeCustomerId).catch(logRollback);
    const msg = err instanceof Error ? err.message : String(err);
    return error(`Account setup failed: ${msg}`);
  }

  const cookie = await createSession(accountId);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}

// –
// Helpers
// –

function error(message: string) {
  return httpError(400, message);
}

function logRollback(err: unknown) {
  console.error("Signup rollback failed:", err);
}
