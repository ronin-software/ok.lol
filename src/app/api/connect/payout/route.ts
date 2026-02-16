import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { account, payout } from "@/db/schema";
import { error } from "@/lib/http";
import { verify } from "@/lib/session";
import {
  getConnectStatus,
  microToCents,
  payoutFee,
  transferToConnected,
} from "@/lib/stripe";
import * as tb from "@/lib/tigerbeetle";

const Body = z.object({ amount: z.number().positive() });

/**
 * POST /api/connect/payout
 *
 * Withdraw credits as real money via Stripe Connect.
 * Uses a saga: reserve in TigerBeetle, transfer via Stripe,
 * then post the pending transfer.
 *
 * Body: { amount: number } — amount in micro-USD.
 */
export async function POST(req: Request) {
  const accountId = await verify();
  if (!accountId) return error(401, "Unauthorized");

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return error(400, "Amount must be positive");
  const rawAmount = parsed.data.amount;

  const amount = BigInt(rawAmount);
  const fee = payoutFee(amount);
  const net = amount - fee;

  // Minimum payout: net must convert to at least 1 cent.
  if (microToCents(net) < 1) {
    return error(400, "Amount too small for payout");
  }

  const connectId = await verifyConnect(accountId);
  if (!connectId) return error(403, "Payouts not enabled or incomplete");

  const tbAcct = await tb.lookupAccount(BigInt(accountId));
  if (!tbAcct) return error(404, "Ledger account not found");
  if (tb.available(tbAcct) < amount) {
    return error(402, "Insufficient balance");
  }

  return executeSaga(accountId, connectId, amount, fee, net);
}

// –
// Helpers
// –

/** Verify Stripe Connect is enabled for this account. */
async function verifyConnect(accountId: string): Promise<string | null> {
  const acct = await db
    .select({ stripeConnectId: account.stripeConnectId })
    .from(account)
    .where(eq(account.id, accountId))
    .then((rows) => rows[0]);
  if (!acct?.stripeConnectId) return null;

  const enabled = await getConnectStatus(acct.stripeConnectId);
  if (!enabled) return null;
  return acct.stripeConnectId;
}

/**
 * Execute the 3-step payout saga:
 * 1. Reserve in TigerBeetle.
 * 2. Transfer via Stripe.
 * 3. Post the TigerBeetle pending transfer.
 */
async function executeSaga(
  accountId: string,
  connectId: string,
  amount: bigint,
  fee: bigint,
  net: bigint,
) {
  const rows = await db
    .insert(payout)
    .values({ accountId, amount, fee, status: "reserved" })
    .returning({ id: payout.id });
  const payoutId = rows[0]!.id;

  // Step 1: Reserve (auto-voids after 10 min).
  let pendingId: bigint;
  try {
    pendingId = await tb.reserve(
      BigInt(accountId),
      amount,
      600,
      tb.CODE_PAYOUT,
    );
  } catch {
    await markFailed(payoutId);
    return error(402, "Insufficient balance");
  }

  await db
    .update(payout)
    .set({ pendingTransferId: String(pendingId) })
    .where(eq(payout.id, payoutId));

  // Step 2: Stripe transfer (net only — fee stays in platform).
  let stripeTransferId: string;
  try {
    stripeTransferId = await transferToConnected(
      connectId,
      microToCents(net),
      `payout_${payoutId}`,
    );
  } catch (err) {
    await tb.void_(pendingId);
    await markFailed(payoutId);
    const msg = err instanceof Error ? err.message : String(err);
    return error(502, `Stripe transfer failed: ${msg}`);
  }

  await db
    .update(payout)
    .set({
      status: "transferred",
      stripeTransferId,
      updatedAt: new Date(),
    })
    .where(eq(payout.id, payoutId));

  // Step 3: Finalize the TigerBeetle debit.
  try {
    await tb.post(pendingId, amount);
  } catch (err) {
    console.error(`Payout ${payoutId}: TB post failed after Stripe`, err);
    return Response.json({
      amount: Number(amount),
      fee: Number(fee),
      net: Number(net),
      warning: "Payout issued but ledger settlement pending",
    });
  }

  await db
    .update(payout)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(payout.id, payoutId));

  return Response.json({
    amount: Number(amount),
    fee: Number(fee),
    net: Number(net),
  });
}

/** Mark a payout row as failed. */
async function markFailed(payoutId: string) {
  await db
    .update(payout)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(payout.id, payoutId));
}
