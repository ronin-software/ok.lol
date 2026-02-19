import { describe, expect, test } from "bun:test";
import {
  dollarsToMicro,
  InsufficientFundsError,
  MAX_RELOAD_MICRO,
  MIN_RELOAD_MICRO,
} from "./billing";

// –
// dollarsToMicro
// –

describe("dollarsToMicro", () => {
  test("converts $1.00 to 1_000_000 micro-USD", () => {
    expect(dollarsToMicro("1.00")).toBe(1_000_000n);
  });

  test("handles small fractional costs from gateway", () => {
    expect(dollarsToMicro("0.0045405")).toBe(4541n);
  });

  test("zero returns 0n", () => {
    expect(dollarsToMicro("0")).toBe(0n);
  });

  test("rounds to nearest micro", () => {
    // 0.0000005 * 1e6 = 0.5 → rounds to 1
    expect(dollarsToMicro("0.0000005")).toBe(1n);
  });
});

// –
// Constants
// –

describe("constants", () => {
  test("MIN_RELOAD_MICRO is $5", () => {
    expect(MIN_RELOAD_MICRO).toBe(5_000_000n);
  });

  test("MAX_RELOAD_MICRO is $4,000", () => {
    expect(MAX_RELOAD_MICRO).toBe(4_000_000_000n);
  });

  test("min < max", () => {
    expect(MIN_RELOAD_MICRO < MAX_RELOAD_MICRO).toBe(true);
  });
});

// –
// InsufficientFundsError
// –

describe("InsufficientFundsError", () => {
  test("default message", () => {
    const err = new InsufficientFundsError();
    expect(err.message).toBe("Insufficient funds");
    expect(err.name).toBe("InsufficientFundsError");
  });

  test("custom message", () => {
    const err = new InsufficientFundsError("Account not found");
    expect(err.message).toBe("Account not found");
  });

  test("is an Error", () => {
    expect(new InsufficientFundsError()).toBeInstanceOf(Error);
  });
});
