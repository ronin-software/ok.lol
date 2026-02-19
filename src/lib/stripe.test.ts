import { describe, expect, test } from "bun:test";
import { centsToMicro, FEE_BPS_PAYOUT, microToCents, payoutFee } from "./stripe";

// –
// centsToMicro
// –

describe("centsToMicro", () => {
  test("converts 100 cents to $1 in micro-USD", () => {
    expect(centsToMicro(100)).toBe(1_000_000n);
  });

  test("converts 1 cent to 10_000 micro-USD", () => {
    expect(centsToMicro(1)).toBe(10_000n);
  });

  test("zero cents is zero micro", () => {
    expect(centsToMicro(0)).toBe(0n);
  });

  test("throws for negative cents", () => {
    expect(() => centsToMicro(-1)).toThrow("non-negative");
  });
});

// –
// microToCents
// –

describe("microToCents", () => {
  test("converts $1 micro-USD to 100 cents", () => {
    expect(microToCents(1_000_000n)).toBe(100);
  });

  test("floors partial cents", () => {
    // 15_000 micro / 10_000 = 1.5 -> 1 cent (floor via bigint division)
    expect(microToCents(15_000n)).toBe(1);
  });

  test("zero micro is zero cents", () => {
    expect(microToCents(0n)).toBe(0);
  });

  test("throws for negative micro", () => {
    expect(() => microToCents(-1n)).toThrow("non-negative");
  });
});

// –
// payoutFee
// –

describe("payoutFee", () => {
  test("1% of 1_000_000 micro-USD", () => {
    // 1_000_000 * 100 / 10_000 = 10_000
    expect(payoutFee(1_000_000n)).toBe(10_000n);
  });

  test("ceiling-rounds small amounts", () => {
    // 1 * 100 + 9_999 = 10_099; / 10_000 = 1
    expect(payoutFee(1n)).toBe(1n);
  });

  test("throws for zero amount", () => {
    expect(() => payoutFee(0n)).toThrow("amount must be positive");
  });
});

// –
// Constants
// –

describe("constants", () => {
  test("payout fee is 1% (100 bps)", () => {
    expect(FEE_BPS_PAYOUT).toBe(100n);
  });
});
