/**
 * Usage recording and billing.
 *
 * All metered resource usage (model inference, tunnel egress, email sends)
 * flows through `recordUsage`, which inserts a row in the usage table
 * and debits the principal's TigerBeetle account in one step.
 */

import { db } from "@/db";
import { usage } from "@/db/schema";
import { debit } from "./tigerbeetle";

/** Converts a dollar string (e.g. "0.0045405") to micro-USD bigint. */
export function dollarsToMicro(dollars: string): bigint {
  const micro = Math.round(parseFloat(dollars) * 1_000_000);
  return BigInt(micro);
}

/**
 * Record resource usage: insert a usage row and debit the account.
 *
 * No-op when cost is zero or negative (e.g. gateway reports no cost).
 */
export async function recordUsage(opts: {
  /** Account to charge. */
  accountId: string;
  /** Quantity consumed (units depend on resource). */
  amount: bigint;
  /** Cost in micro-USD. */
  cost: bigint;
  /** Hire ID, if executing on behalf of another principal. */
  hireId?: string;
  /** Resource identifier (e.g. model ID, "tunnel:egress", "resend:send"). */
  resource: string;
}): Promise<void> {
  if (opts.cost <= 0n) return;

  await db.insert(usage).values({
    accountId: opts.accountId,
    amount: opts.amount,
    cost: opts.cost,
    hireId: opts.hireId,
    resource: opts.resource,
  });

  await debit(BigInt(opts.accountId), opts.cost);
}
