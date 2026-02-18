import { describe, expect, test } from "bun:test";
import { assert } from "./assert";

describe("assert", () => {
  test("passes for truthy values", () => {
    assert(true, "should pass");
    assert(1, "should pass");
    assert("non-empty", "should pass");
    assert({}, "should pass");
  });

  test("throws for falsy values", () => {
    expect(() => assert(false, "was false")).toThrow("Assertion failed: was false");
    expect(() => assert(null, "was null")).toThrow("Assertion failed: was null");
    expect(() => assert(undefined, "was undefined")).toThrow("Assertion failed: was undefined");
    expect(() => assert("", "was empty")).toThrow("Assertion failed: was empty");
    expect(() => assert(0, "was zero")).toThrow("Assertion failed: was zero");
  });

  test("narrows type after assertion", () => {
    const value: string | undefined = "hello";
    assert(value, "must be defined");
    // After assert, TypeScript knows value is string.
    expect(value.toUpperCase()).toBe("HELLO");
  });
});
