import { assert } from "./assert";

const LEDGER_URL = process.env.LEDGER_URL;
const LEDGER_SECRET = process.env.LEDGER_SECRET;

// –
// Account type (mirrors tigerbeetle-node's Account)
// –

export interface Account {
  /** Transfer code. */
  code: number;
  /** Pending credits. */
  credits_pending: bigint;
  /** Posted credits. */
  credits_posted: bigint;
  /** Pending debits. */
  debits_pending: bigint;
  /** Posted debits. */
  debits_posted: bigint;
  /** Account flags. */
  flags: number;
  /** Account ID. */
  id: bigint;
  /** Ledger identifier. */
  ledger: number;
  /** Reserved field. */
  reserved: number;
  /** Creation timestamp. */
  timestamp: bigint;
  /** 128-bit user data. */
  user_data_128: bigint;
  /** 32-bit user data. */
  user_data_32: number;
  /** 64-bit user data. */
  user_data_64: bigint;
}

/** Deserialize a JSON account (string bigints) into a typed Account. */
function parseAccount(raw: Record<string, unknown>): Account {
  return {
    code: Number(raw.code),
    credits_pending: BigInt(raw.credits_pending as string),
    credits_posted: BigInt(raw.credits_posted as string),
    debits_pending: BigInt(raw.debits_pending as string),
    debits_posted: BigInt(raw.debits_posted as string),
    flags: Number(raw.flags),
    id: BigInt(raw.id as string),
    ledger: Number(raw.ledger),
    reserved: Number(raw.reserved),
    timestamp: BigInt(raw.timestamp as string),
    user_data_128: BigInt(raw.user_data_128 as string),
    user_data_32: Number(raw.user_data_32),
    user_data_64: BigInt(raw.user_data_64 as string),
  };
}

// –
// RPC
// –

/** Call a ledger service endpoint. Throws on non-2xx. */
async function rpc<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  assert(LEDGER_URL, "LEDGER_URL is required");
  assert(LEDGER_SECRET, "LEDGER_SECRET is required");

  const res = await fetch(`${LEDGER_URL}${path}`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${LEDGER_SECRET}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error ?? `Ledger ${path}: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// –
// ID generation
// –

/** Generate a unique 128-bit ID (crypto-random). */
export function id(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const view = new DataView(bytes.buffer);
  // Combine two 64-bit halves into a single 128-bit bigint.
  return (view.getBigUint64(0) << 64n) | view.getBigUint64(8);
}

// –
// Constants
// –

/** Well-known platform revenue account. */
export const PLATFORM_ACCOUNT_ID = 1n;

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
// Pure functions
// –

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

/** M2M transfer fee basis points (50 = 0.50%). */
const FEE_BPS_TRANSFER = 50n;

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
  await rpc("/accounts", { accountId: String(accountId) });
}

/** Look up a single account and return its balance fields. */
export async function lookupAccount(
  accountId: bigint,
): Promise<Account | undefined> {
  assert(accountId > 0n, "accountId must be positive");
  const res = await fetch(`${LEDGER_URL}/accounts/lookup`, {
    body: JSON.stringify({ accountId: String(accountId) }),
    headers: {
      Authorization: `Bearer ${LEDGER_SECRET}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (res.status === 404) return undefined;
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error ?? `Ledger lookup: ${res.status}`);
  }

  const raw = (await res.json()) as Record<string, unknown>;
  return parseAccount(raw);
}

/** Batch-lookup multiple accounts. Returns a Map keyed by account ID. */
export async function lookupAccounts(
  accountIds: bigint[],
): Promise<Map<bigint, Account>> {
  assert(accountIds.length > 0, "accountIds must not be empty");
  const raw = await rpc<Record<string, unknown>[]>("/accounts/lookup-many", {
    accountIds: accountIds.map(String),
  });
  const map = new Map<bigint, Account>();
  for (const entry of raw) {
    const account = parseAccount(entry);
    map.set(account.id, account);
  }
  return map;
}

// –
// Bootstrap
// –

/** Ensure the platform revenue account exists. Idempotent. */
export async function bootstrap() {
  await rpc("/bootstrap");
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

  const result = await rpc<{ transferId: string }>("/reserve", {
    amount: String(amount),
    code,
    debitAccountId: String(debitAccountId),
    timeout,
  });

  const transferId = BigInt(result.transferId);
  assert(transferId > 0n, "transferId must be positive");
  return transferId;
}

/** Post (settle) a pending transfer with the actual amount. */
export async function post(pendingId: bigint, amount: bigint) {
  assert(pendingId > 0n, "pendingId must be positive");
  assert(amount >= 0n, "amount must be non-negative");
  await rpc("/post", {
    amount: String(amount),
    pendingId: String(pendingId),
  });
}

/**
 * Void a pending transfer, releasing the reserved funds.
 * Trailing underscore avoids collision with the `void` keyword.
 */
export async function void_(pendingId: bigint) {
  assert(pendingId > 0n, "pendingId must be positive");
  await rpc("/void", { pendingId: String(pendingId) });
}

// –
// M2M Transfers
// –

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
  await rpc("/transfer", {
    amount: String(amount),
    fromId: String(fromId),
    toId: String(toId),
  });
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
  await rpc("/debit", {
    accountId: String(accountId),
    amount: String(amount),
  });
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
  await rpc("/fund", {
    amount: String(amount),
    creditAccountId: String(creditAccountId),
  });
}
