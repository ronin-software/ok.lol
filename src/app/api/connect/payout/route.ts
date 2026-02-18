import { db } from "@/db";
import { account } from "@/db/schema";
import { error } from "@/lib/http";
import { processPayout } from "@/lib/payouts";
import { verify } from "@/lib/session";
import { getConnectStatus, microToCents, payoutFee } from "@/lib/stripe";
import * as tb from "@/lib/tigerbeetle";
import { eq } from "drizzle-orm";
import { z } from "zod";

const Body = z.object({ amount: z.number().positive() });

/**
 * POST /api/connect/payout
 *
 * Withdraw credits as real money via Stripe Connect.
 * Body: { amount: number } — amount in micro-USD.
 */
export async function POST(req: Request) {
  const accountId = await verify();
  if (!accountId) return error(401, "Unauthorized");

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return error(400, "Amount must be positive");
  const amount = BigInt(parsed.data.amount);

  const fee = payoutFee(amount);
  const net = amount - fee;

  // Minimum payout: net must convert to at least 1 cent.
  if (microToCents(net) < 1) {
    return error(400, "Amount too small for payout");
  }

  const connectId = await resolveConnect(accountId);
  if (!connectId) return error(403, "Payouts not enabled or incomplete");

  const tbAcct = await tb.lookupAccount(BigInt(accountId));
  if (!tbAcct) return error(404, "Ledger account not found");
  if (tb.available(tbAcct) < amount) return error(402, "Insufficient balance");

  const result = await processPayout(accountId, connectId, amount, fee, net);
  if (!result.ok) return error(result.status, result.message);
  return Response.json(result.value);
}

/** Verify Stripe Connect is enabled and return the Connect account ID. */
async function resolveConnect(accountId: string): Promise<string | null> {
  const row = await db
    .select({ stripeConnectId: account.stripeConnectId })
    .from(account)
    .where(eq(account.id, accountId))
    .then((rows) => rows[0]);
  if (!row?.stripeConnectId) return null;

  const enabled = await getConnectStatus(row.stripeConnectId);
  return enabled ? row.stripeConnectId : null;
}
