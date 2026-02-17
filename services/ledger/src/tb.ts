import { resolve6 } from "node:dns/promises";
import {
  AccountFlags,
  TransferFlags,
  createClient,
  id,
  type Account,
} from "tigerbeetle-node";

export type { Account } from "tigerbeetle-node";

// Resolve hostnames to IPv6 for Fly.io internal networking.
// The TB client only accepts raw IP:port, not hostnames.
async function resolveAddresses(raw: string): Promise<string[]> {
  const parts = raw.split(",");
  return Promise.all(
    parts.map(async (addr) => {
      if (!/[a-zA-Z]/.test(addr)) return addr;
      const colonIdx = addr.lastIndexOf(":");
      const host = colonIdx > -1 ? addr.slice(0, colonIdx) : addr;
      const port = colonIdx > -1 ? addr.slice(colonIdx + 1) : "3000";
      const ips = await resolve6(host);
      return `[${ips[0]}]:${port}`;
    }),
  );
}

const addresses = await resolveAddresses(
  process.env.TB_ADDRESSES ?? "3000",
);

const tb = createClient({
  cluster_id: BigInt(process.env.TB_CLUSTER_ID ?? "0"),
  replica_addresses: addresses,
});

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
  const accounts = await tb.lookupAccounts([accountId]);
  return accounts[0];
}

/** Batch-lookup multiple accounts. */
export async function lookupAccounts(
  accountIds: bigint[],
): Promise<Account[]> {
  const accounts = await tb.lookupAccounts(accountIds);
  return Array.from(accounts);
}

// –
// Bootstrap
// –

let bootstrapped = false;

/** Ensure the platform revenue account exists. Idempotent. */
export async function bootstrap() {
  if (bootstrapped) return;
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
  bootstrapped = true;
}

// –
// Pending Transfers
// –

/**
 * Reserve funds from a user account to platform.
 * Returns the transfer ID.
 */
export async function reserve(
  debitAccountId: bigint,
  amount: bigint,
  timeout = 300,
  code = CODE_USAGE,
): Promise<bigint> {
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
  return transferId;
}

/** Post (settle) a pending transfer with the actual amount. */
export async function post(pendingId: bigint, amount: bigint) {
  const errors = await tb.createTransfers([
    {
      amount,
      code: 0,
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

/** Void a pending transfer, releasing the reserved funds. */
export async function void_(pendingId: bigint) {
  const errors = await tb.createTransfers([
    {
      amount: 0n,
      code: 0,
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

/**
 * Compute the recipient-paid fee for an amount.
 * Ceiling-rounds toward platform so we never undercharge.
 */
export function fee(amount: bigint): bigint {
  return (amount * FEE_BPS_TRANSFER + 9999n) / 10000n;
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
  const transferFee = fee(amount);
  const net = amount - transferFee;
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

/** Direct debit from a user account to platform for usage charges. */
export async function debit(
  accountId: bigint,
  amount: bigint,
) {
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
