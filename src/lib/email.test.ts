import { describe, expect, test } from "bun:test";
import { normalizeSubject, stripQuotedReply } from "./email";

// –
// stripQuotedReply
// –

describe("stripQuotedReply", () => {
  test("returns full text when no quoted reply", () => {
    expect(stripQuotedReply("Hello there")).toBe("Hello there");
  });

  test("strips > quoted lines", () => {
    const input = "New content\n\n> Old content\n> More old";
    expect(stripQuotedReply(input)).toBe("New content");
  });

  test("strips 'On ... wrote:' header", () => {
    const input = "Thanks!\n\nOn Mon, Jan 1, 2026, Alice wrote:\n> Hi";
    expect(stripQuotedReply(input)).toBe("Thanks!");
  });

  test("strips --- Original Message --- header", () => {
    const input = "Got it.\n\n--- Original Message ---\nFrom: bob";
    expect(stripQuotedReply(input)).toBe("Got it.");
  });

  test("strips ___ separator", () => {
    const input = "Done.\n___\nPrevious message";
    expect(stripQuotedReply(input)).toBe("Done.");
  });

  test("strips From: header line", () => {
    const input = "Sure thing.\n\nFrom: alice@test.com\nSent: Monday";
    expect(stripQuotedReply(input)).toBe("Sure thing.");
  });

  test("trims leading/trailing whitespace", () => {
    const input = "  Hello  \n\n> quoted";
    expect(stripQuotedReply(input)).toBe("Hello");
  });

  test("handles empty string", () => {
    expect(stripQuotedReply("")).toBe("");
  });

  test("handles multiline new content before quote", () => {
    const input = "Line one\nLine two\nLine three\n\n> quoted";
    expect(stripQuotedReply(input)).toBe("Line one\nLine two\nLine three");
  });
});

// –
// normalizeSubject
// –

describe("normalizeSubject", () => {
  test("strips Re: prefix", () => {
    expect(normalizeSubject("Re: Hello")).toBe("Hello");
  });

  test("strips Fwd: prefix", () => {
    expect(normalizeSubject("Fwd: Hello")).toBe("Hello");
  });

  test("strips Fw: prefix", () => {
    expect(normalizeSubject("Fw: Hello")).toBe("Hello");
  });

  test("strips nested Re: Re:", () => {
    expect(normalizeSubject("Re: Re: Hello")).toBe("Hello");
  });

  test("case insensitive", () => {
    expect(normalizeSubject("RE: FWD: Hello")).toBe("Hello");
  });

  test("trims surrounding whitespace", () => {
    expect(normalizeSubject("Re: Hello  ")).toBe("Hello");
  });

  test("returns unchanged subject with no prefix", () => {
    expect(normalizeSubject("Hello World")).toBe("Hello World");
  });
});
