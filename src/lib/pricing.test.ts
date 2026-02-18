import { describe, expect, test } from "bun:test";
import { computeCost, unitCost, unitCosts } from "./pricing";

describe("unitCost", () => {
  test("returns cost for known resource", () => {
    expect(unitCost("resend:send")).toBe(900n);
  });

  test("throws for unknown resource", () => {
    expect(() => unitCost("unknown:resource")).toThrow("Unknown resource");
  });
});

describe("computeCost", () => {
  test("multiplies amount by unit cost", () => {
    // 3 emails * 900 micro-USD = 2700
    expect(computeCost("resend:send", 3n)).toBe(2700n);
  });

  test("1 unit returns the unit cost", () => {
    expect(computeCost("resend:send", 1n)).toBe(900n);
  });
});

describe("unitCosts registry", () => {
  test("has at least one entry", () => {
    expect(Object.keys(unitCosts).length).toBeGreaterThan(0);
  });

  test("all costs are positive", () => {
    for (const [key, cost] of Object.entries(unitCosts)) {
      expect(cost).toBeGreaterThan(0n);
    }
  });
});
