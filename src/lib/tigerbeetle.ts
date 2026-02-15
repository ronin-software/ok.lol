import {
  AccountFlags,
  TransferFlags,
  createClient,
  id,
  type Account,
} from "tigerbeetle-node";
import { assert } from "./assert";

export { id } from "tigerbeetle-node";
export type { Account } from "tigerbeetle-node";

// Persist across HMR in development.
const globalStore = globalThis as unknown as {
  __tb?: ReturnType<typeof createClient>;
  __tbBootstrapped?: boolean;
};
const tb = (globalStore.__tb ??= createClient({
  cluster_id: BigInt(process.env.TB_CLUSTER_ID ?? "0"),
  replica_addresses: (
    process.env.TB_ADDRESSES ?? "3000"
  ).split(","),
}));

/** Ledger 1 = USD in micro-dollar precision (1e-6). */
const LEDGER = 1;

/** Well-known platform revenue account. */
export const PLATFORM_ACCOUNT_ID = 1n;

// –
// Codes
// –

/** Transfer code for proxy usage debits. */
export const CODE_USAGE = 1;

/** Transfer code for Stripe funding credits. */
export const CODE_FUNDING = 2;

/** Transfer code for M2M credit transfers. */
export const CODE_TRANSFER = 3;

/** Transfer code for platform fees on M2M transfers. */
export const CODE_FEE = 4;

/** Transfer code for payout withdrawals. */
export const CODE_PAYOUT = 5;

/** Transfer code for hire escrow (base fee + usage budget). */
export const CODE_ESCROW = 6;

// –
// Accounts
// –

/** Create a user account that cannot overdraw (debits <= credits). */
export async function createAccount(accountId: bigint) {
  assert(accountId > 0n, "accountId must be positive");
  assert(
    accountId !== PLATFORM_ACCOUNT_ID,
    "cannot create a user account with the platform ID",
  );
  const errors = await tb.createAccounts([
    {
      code: CODE_USAGE,
      credits_pending: 0n,
      credits_posted: 0n,
      debits_pending: 0n,
      debits_posted: 0n,
      flags: AccountFlags.debits_must_not_exceed_credits,
      id: accountId,
      ledger: LEDGER,
      reserved: 0,
      timestamp: 0n,
      user_data_128: 0n,
      user_data_32: 0,
      user_data_64: 0n,
    },
  ]);
  const [err] = errors;
  if (err) {
    throw new Error(`TB create account: ${err.result}`);
  }
}

/** Look up a single account and return its balance fields. */
export async function lookupAccount(
  accountId: bigint,
): Promise<Account | undefined> {
  assert(accountId > 0n, "accountId must be positive");
  const accounts = await tb.lookupAccounts([accountId]);
  return accounts[0];
}

/** Batch-lookup multiple accounts. Returns a Map keyed by account ID. */
export async function lookupAccounts(
  accountIds: bigint[],
): Promise<Map<bigint, Account>> {
  assert(accountIds.length > 0, "accountIds must not be empty");
  const accounts = await tb.lookupAccounts(accountIds);
  const map = new Map<bigint, Account>();
  for (const account of accounts) {
    map.set(account.id, account);
  }
  return map;
}

/**
 * Available balance = credits_posted - debits_posted - debits_pending.
 * This is what can still be reserved for new transfers.
 */
export function available(account: Account): bigint {
  const result =
    account.credits_posted -
    account.debits_posted -
    account.debits_pending;
  assert(result >= 0n, "available balance must be non-negative");
  return result;
}

// –
// Bootstrap
// –

/** Ensure the platform revenue account exists. Idempotent. */
export async function bootstrap() {
  if (globalStore.__tbBootstrapped) return;
  await tb.createAccounts([
    {
      code: CODE_USAGE,
      credits_pending: 0n,
      credits_posted: 0n,
      debits_pending: 0n,
      debits_posted: 0n,
      flags: AccountFlags.history,
      id: PLATFORM_ACCOUNT_ID,
      ledger: LEDGER,
      reserved: 0,
      timestamp: 0n,
      user_data_128: 0n,
      user_data_32: 0,
      user_data_64: 0n,
    },
  ]);
  // Ignore "exists" errors — idempotent by design.
  globalStore.__tbBootstrapped = true;
}

// –
// Pending Transfers
// –

/**
 * Reserve funds from a user account to platform.
 * Returns the transfer ID.
 *
 * Default timeout is 300s (5 min) — long enough for a single
 * inference request to complete but short enough to avoid
 * indefinitely locked funds.
 */
export async function reserve(
  debitAccountId: bigint,
  amount: bigint,
  /** Timeout in seconds before the pending transfer auto-voids. */
  timeout = 300,
  /** Transfer code. Defaults to usage; use CODE_PAYOUT for withdrawals. */
  code = CODE_USAGE,
): Promise<bigint> {
  assert(amount > 0n, "amount must be positive");
  assert(
    debitAccountId !== PLATFORM_ACCOUNT_ID,
    "cannot reserve from the platform account",
  );
  assert(timeout > 0, "timeout must be positive");
  const transferId = id();
  const errors = await tb.createTransfers([
    {
      amount,
      code,
      credit_account_id: PLATFORM_ACCOUNT_ID,
      debit_account_id: debitAccountId,
      flags: TransferFlags.pending,
      id: transferId,
      ledger: LEDGER,
      pending_id: 0n,
      timeout,
      timestamp: 0n,
      user_data_128: 0n,
      user_data_32: 0,
      user_data_64: 0n,
    },
  ]);
  const [err] = errors;
  if (err) {
    throw new Error(`TB reserve: ${err.result}`);
  }
  assert(transferId > 0n, "transferId must be positive");
  return transferId;
}

/** Post (settle) a pending transfer with the actual amount. */
export async function post(pendingId: bigint, amount: bigint) {
  assert(pendingId > 0n, "pendingId must be positive");
  assert(amount >= 0n, "amount must be non-negative");
  const errors = await tb.createTransfers([
    {
      amount,
      code: 0, // Inherit from pending.
      credit_account_id: 0n,
      debit_account_id: 0n,
      flags: TransferFlags.post_pending_transfer,
      id: id(),
      ledger: LEDGER,
      pending_id: pendingId,
      timeout: 0,
      timestamp: 0n,
      user_data_128: 0n,
      user_data_32: 0,
      user_data_64: 0n,
    },
  ]);
  const [err] = errors;
  if (err) {
    throw new Error(`TB post: ${err.result}`);
  }
}

/**
 * Void a pending transfer, releasing the reserved funds.
 * Trailing underscore avoids collision with the `void` keyword.
 */
export async function void_(pendingId: bigint) {
  assert(pendingId > 0n, "pendingId must be positive");
  const errors = await tb.createTransfers([
    {
      amount: 0n,
      code: 0, // Inherit from pending.
      credit_account_id: 0n,
      debit_account_id: 0n,
      flags: TransferFlags.void_pending_transfer,
      id: id(),
      ledger: LEDGER,
      pending_id: pendingId,
      timeout: 0,
      timestamp: 0n,
      user_data_128: 0n,
      user_data_32: 0,
      user_data_64: 0n,
    },
  ]);
  const [err] = errors;
  if (err) {
    throw new Error(`TB void: ${err.result}`);
  }
}

// –
// M2M Transfers
// –

/** M2M transfer fee basis points (50 = 0.50%). */
const FEE_BPS_TRANSFER = 50n;

// Sanity: fee must be between 0 and 100%.
assert(FEE_BPS_TRANSFER > 0n, "FEE_BPS_TRANSFER must be positive");
assert(FEE_BPS_TRANSFER < 10000n, "FEE_BPS_TRANSFER must be < 100%");

/**
 * Compute the recipient-paid fee for an amount.
 * Ceiling-rounds toward platform so we never undercharge.
 */
export function fee(amount: bigint): bigint {
  assert(amount > 0n, "amount must be positive");
  const result =
    (amount * FEE_BPS_TRANSFER + 9999n) / 10000n;
  assert(result > 0n, "fee must be positive for positive amount");
  return result;
}

/**
 * Atomic M2M transfer: debit sender for full amount, credit
 * recipient (amount - fee), credit platform (fee).
 * Uses TB linked transfers for atomicity.
 */
export async function transfer(
  fromId: bigint,
  toId: bigint,
  amount: bigint,
) {
  assert(fromId > 0n, "fromId must be positive");
  assert(toId > 0n, "toId must be positive");
  assert(fromId !== toId, "cannot transfer to self");
  assert(amount > 0n, "amount must be positive");
  const transferFee = fee(amount);
  const net = amount - transferFee;
  assert(net > 0n, "net must be positive after fee");
  const errors = await tb.createTransfers([
    // Leg 1 (linked): sender -> recipient for net amount.
    {
      amount: net,
      code: CODE_TRANSFER,
      credit_account_id: toId,
      debit_account_id: fromId,
      flags: TransferFlags.linked,
      id: id(),
      ledger: LEDGER,
      pending_id: 0n,
      timeout: 0,
      timestamp: 0n,
      user_data_128: 0n,
      user_data_32: 0,
      user_data_64: 0n,
    },
    // Leg 2: sender -> platform for fee.
    {
      amount: transferFee,
      code: CODE_FEE,
      credit_account_id: PLATFORM_ACCOUNT_ID,
      debit_account_id: fromId,
      flags: TransferFlags.none,
      id: id(),
      ledger: LEDGER,
      pending_id: 0n,
      timeout: 0,
      timestamp: 0n,
      user_data_128: 0n,
      user_data_32: 0,
      user_data_64: 0n,
    },
  ]);
  const [err] = errors;
  if (err) {
    throw new Error(`TB transfer: ${err.result}`);
  }
}

// –
// Usage Debits
// –

/**
 * Direct debit from a user account to platform for usage charges.
 * Unlike `reserve`, this is immediate (no pending/post cycle) because
 * usage has already occurred by the time we know the token count.
 */
export async function debit(
  accountId: bigint,
  amount: bigint,
) {
  assert(amount > 0n, "amount must be positive");
  assert(
    accountId !== PLATFORM_ACCOUNT_ID,
    "cannot debit the platform account",
  );
  const errors = await tb.createTransfers([
    {
      amount,
      code: CODE_USAGE,
      credit_account_id: PLATFORM_ACCOUNT_ID,
      debit_account_id: accountId,
      flags: TransferFlags.none,
      id: id(),
      ledger: LEDGER,
      pending_id: 0n,
      timeout: 0,
      timestamp: 0n,
      user_data_128: 0n,
      user_data_32: 0,
      user_data_64: 0n,
    },
  ]);
  const [err] = errors;
  if (err) {
    throw new Error(`TB debit: ${err.result}`);
  }
}

// –
// Funding
// –

/** Credit a user account (e.g. from Stripe funding). */
export async function fund(
  creditAccountId: bigint,
  amount: bigint,
) {
  assert(amount > 0n, "amount must be positive");
  assert(
    creditAccountId !== PLATFORM_ACCOUNT_ID,
    "cannot fund the platform from itself",
  );
  const errors = await tb.createTransfers([
    {
      amount,
      code: CODE_FUNDING,
      credit_account_id: creditAccountId,
      debit_account_id: PLATFORM_ACCOUNT_ID,
      flags: TransferFlags.none,
      id: id(),
      ledger: LEDGER,
      pending_id: 0n,
      timeout: 0,
      timestamp: 0n,
      user_data_128: 0n,
      user_data_32: 0,
      user_data_64: 0n,
    },
  ]);
  const [err] = errors;
  if (err) {
    throw new Error(`TB fund: ${err.result}`);
  }
}
