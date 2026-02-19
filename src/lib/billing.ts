/**
 * Usage recording, auto-reload, and pre-operation balance gating.
 *
 * All metered resource usage (model inference, tunnel egress, email sends)
 * flows through `recordUsage`, which inserts a row in the usage table,
 * debits the principal's TigerBeetle account, and triggers auto-reload
 * when the balance drops below the configured threshold.
 *
 * `ensureFunded` is the pre-operation gate — called before any billable
 * work to verify the account can cover costs. It attempts an auto-reload
 * if the balance is low and rejects the operation if funding fails.
 */

import { db } from "@/db";
import { account, usage } from "@/db/schema";
import { eq, gte, sql, and } from "drizzle-orm";
import { chargeOffSession, centsToMicro, microToCents } from "./stripe";
import { available, debit, fund, lookupAccount } from "./tigerbeetle";

// –
// Constants
// –

/** Minimum configurable reload value in micro-USD ($5). */
export const MIN_RELOAD_MICRO = 5_000_000n;

/** Maximum configurable reload value in micro-USD ($4,000). */
export const MAX_RELOAD_MICRO = 4_000_000_000n;

/** Minimum auto-reload charge in cents ($1). */
const MIN_CHARGE_CENTS = 100;

// –
// Errors
// –

export class InsufficientFundsError extends Error {
  constructor(message = "Insufficient funds") {
    super(message);
    this.name = "InsufficientFundsError";
  }
}

// –
// Conversions
// –

/** Converts a dollar string (e.g. "0.0045405") to micro-USD bigint. */
export function dollarsToMicro(dollars: string): bigint {
  const micro = Math.round(parseFloat(dollars) * 1_000_000);
  return BigInt(micro);
}

// –
// Usage recording
// –

/**
 * Record resource usage: insert a usage row and debit the account.
 *
 * No-op when cost is zero or negative (e.g. gateway reports no cost).
 * Fires a background auto-reload check after debiting.
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

  // Keep balance topped up between operations.
  autoReload(opts.accountId).catch(() => {});
}

// –
// Monthly spend
// –

/** Sum of usage costs for the current calendar month. */
export async function monthlySpend(accountId: string): Promise<bigint> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${usage.cost}), 0)` })
    .from(usage)
    .where(
      and(
        eq(usage.accountId, accountId),
        gte(usage.createdAt, monthStart),
      ),
    );

  return BigInt(row?.total ?? "0");
}

// –
// Auto-reload
// –

/**
 * Attempt auto-reload if balance is below threshold and spend limit allows.
 * Charges the customer's saved card and credits the account inline.
 * Returns true if the account was reloaded.
 */
export async function autoReload(accountId: string): Promise<boolean> {
  // Fetch account config and TB balance in parallel.
  const [acctRow, tbAcct] = await Promise.all([
    db
      .select({
        autoReloadTarget: account.autoReloadTarget,
        autoReloadThreshold: account.autoReloadThreshold,
        monthlySpendLimit: account.monthlySpendLimit,
        stripeCustomerId: account.stripeCustomerId,
      })
      .from(account)
      .where(eq(account.id, accountId))
      .then((rows) => rows[0]),
    lookupAccount(BigInt(accountId)),
  ]);

  if (!acctRow || !tbAcct) return false;

  const balance = available(tbAcct);
  if (balance >= acctRow.autoReloadThreshold) return false;

  // No saved card — can't reload.
  if (!acctRow.stripeCustomerId) return false;

  // Enforce monthly spend limit.
  const spent = await monthlySpend(accountId);
  if (spent >= acctRow.monthlySpendLimit) return false;

  // Charge enough to bring balance back to target.
  const deficit = acctRow.autoReloadTarget - balance;
  const chargeCents = Math.max(microToCents(deficit), MIN_CHARGE_CENTS);

  // Don't exceed the remaining monthly budget.
  const remainingMicro = acctRow.monthlySpendLimit - spent;
  const cappedCents = Math.min(chargeCents, microToCents(remainingMicro));
  if (cappedCents < MIN_CHARGE_CENTS) return false;

  const intentId = await chargeOffSession(
    acctRow.stripeCustomerId,
    cappedCents,
    accountId,
  );
  if (!intentId) return false;

  // Credit inline — don't wait for the async webhook.
  await fund(BigInt(accountId), centsToMicro(cappedCents));
  return true;
}

// –
// Pre-operation gate
// –

/**
 * Ensure the account has sufficient balance for billable work.
 * Attempts auto-reload if balance is below threshold.
 * Throws `InsufficientFundsError` if funding fails.
 */
export async function ensureFunded(accountId: string): Promise<void> {
  const [acctRow, tbAcct] = await Promise.all([
    db
      .select({ autoReloadThreshold: account.autoReloadThreshold })
      .from(account)
      .where(eq(account.id, accountId))
      .then((rows) => rows[0]),
    lookupAccount(BigInt(accountId)),
  ]);

  if (!acctRow || !tbAcct) throw new InsufficientFundsError("Account not found");

  const balance = available(tbAcct);
  if (balance >= acctRow.autoReloadThreshold) return;

  const reloaded = await autoReload(accountId);
  if (!reloaded) throw new InsufficientFundsError();
}
