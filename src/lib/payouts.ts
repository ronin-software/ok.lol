/**
 * Payout saga: reserve in TigerBeetle, transfer via Stripe, post the debit.
 *
 * Each step is recorded in the `payout` table so the state is recoverable
 * if a step fails mid-way.
 */

import { db } from "@/db";
import { payout } from "@/db/schema";
import { microToCents, transferToConnected } from "@/lib/stripe";
import * as tb from "@/lib/tigerbeetle";
import { eq } from "drizzle-orm";

/** Result of a successful payout. */
export type PayoutResult = {
  /** Amount requested in micro-USD. */
  amount: number;
  /** Platform fee in micro-USD. */
  fee: number;
  /** Net amount transferred in micro-USD. */
  net: number;
  /** Non-fatal warning when ledger settlement is still pending. */
  warning?: string;
};

/**
 * Execute the 3-step payout saga.
 *
 * Returns `{ ok: true, value }` on success or `{ ok: false, status, message }` on failure.
 */
export async function processPayout(
  accountId: string,
  connectId: string,
  amount: bigint,
  fee: bigint,
  net: bigint,
): Promise<
  | { ok: true; value: PayoutResult }
  | { ok: false; status: number; message: string }
> {
  const rows = await db
    .insert(payout)
    .values({ accountId, amount, fee, status: "reserved" })
    .returning({ id: payout.id });
  const payoutId = rows[0]!.id;

  // Step 1: Reserve (auto-voids after 10 min).
  let pendingId: bigint;
  try {
    pendingId = await tb.reserve(BigInt(accountId), amount, 600, tb.CODE_PAYOUT);
  } catch {
    await markFailed(payoutId);
    return { ok: false, status: 402, message: "Insufficient balance" };
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
    return { ok: false, status: 502, message: `Stripe transfer failed: ${msg}` };
  }

  await db
    .update(payout)
    .set({ status: "transferred", stripeTransferId, updatedAt: new Date() })
    .where(eq(payout.id, payoutId));

  // Step 3: Finalize the TigerBeetle debit.
  try {
    await tb.post(pendingId, amount);
  } catch (err) {
    console.error(`Payout ${payoutId}: TB post failed after Stripe`, err);
    return {
      ok: true,
      value: {
        amount: Number(amount),
        fee: Number(fee),
        net: Number(net),
        warning: "Payout issued but ledger settlement pending",
      },
    };
  }

  await db
    .update(payout)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(payout.id, payoutId));

  return { ok: true, value: { amount: Number(amount), fee: Number(fee), net: Number(net) } };
}

async function markFailed(payoutId: string) {
  await db
    .update(payout)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(payout.id, payoutId));
}
