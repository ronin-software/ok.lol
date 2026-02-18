import { describe, expect, test } from "bun:test";
import type { Account } from "./tigerbeetle";
import { available, fee, id, PLATFORM_ACCOUNT_ID } from "./tigerbeetle";

// –
// Helpers
// –

/** Builds a minimal Account for testing balance functions. */
function account(overrides: Partial<Account> = {}): Account {
  return {
    code: 0,
    credits_pending: 0n,
    credits_posted: 0n,
    debits_pending: 0n,
    debits_posted: 0n,
    flags: 0,
    id: 2n,
    ledger: 1,
    reserved: 0,
    timestamp: 0n,
    user_data_128: 0n,
    user_data_32: 0,
    user_data_64: 0n,
    ...overrides,
  };
}

// –
// available
// –

describe("available", () => {
  test("zero when no credits", () => {
    expect(available(account())).toBe(0n);
  });

  test("credits_posted minus debits", () => {
    const a = account({ credits_posted: 1_000_000n, debits_posted: 300_000n });
    expect(available(a)).toBe(700_000n);
  });

  test("subtracts pending debits", () => {
    const a = account({
      credits_posted: 1_000_000n,
      debits_pending: 200_000n,
      debits_posted: 300_000n,
    });
    expect(available(a)).toBe(500_000n);
  });

  test("exactly zero is valid", () => {
    const a = account({ credits_posted: 100n, debits_posted: 100n });
    expect(available(a)).toBe(0n);
  });
});

// –
// fee
// –

describe("fee", () => {
  test("0.50% of 1_000_000 micro-USD", () => {
    // 1_000_000 * 50 / 10_000 = 5_000
    expect(fee(1_000_000n)).toBe(5_000n);
  });

  test("ceiling-rounds small amounts", () => {
    // 100 * 50 = 5_000; 5_000 + 9_999 = 14_999; 14_999 / 10_000 = 1
    expect(fee(100n)).toBe(1n);
  });

  test("fee is always positive for positive amount", () => {
    expect(fee(1n)).toBe(1n);
  });

  test("throws for zero amount", () => {
    expect(() => fee(0n)).toThrow("amount must be positive");
  });
});

// –
// id
// –

describe("id", () => {
  test("generates positive 128-bit bigint", () => {
    const result = id();
    expect(result).toBeGreaterThan(0n);
  });

  test("generates unique values", () => {
    const a = id();
    const b = id();
    expect(a).not.toBe(b);
  });
});

// –
// Constants
// –

describe("constants", () => {
  test("platform account ID is 1", () => {
    expect(PLATFORM_ACCOUNT_ID).toBe(1n);
  });
});
