import { describe, expect, test } from "bun:test";
import { parse } from "./parse";

const now = new Date("2026-02-19T12:00:00Z");

describe("parse", () => {
  test("returns nothing for all-comment content", () => {
    const content = [
      "<!-- Keep this empty to do nothing on heartbeats. -->",
      "<!-- Another comment -->",
    ].join("\n");
    expect(parse(content, now)).toEqual([]);
  });

  test("returns nothing for empty content", () => {
    expect(parse("", now)).toEqual([]);
    expect(parse("   \n\n  ", now)).toEqual([]);
  });

  test("extracts standing items (no timestamp)", () => {
    const content = "Check for unread emails\nOrganize documents";
    const items = parse(content, now);
    expect(items).toEqual([
      { task: "Check for unread emails" },
      { task: "Organize documents" },
    ]);
  });

  test("extracts due timestamped items", () => {
    const content = "2026-02-19T10:00:00Z: Send the report";
    const items = parse(content, now);
    expect(items).toHaveLength(1);
    expect(items[0].task).toBe("Send the report");
    expect(items[0].at).toEqual(new Date("2026-02-19T10:00:00Z"));
  });

  test("skips future timestamped items", () => {
    const content = "2026-02-20T10:00:00Z: Not yet due";
    expect(parse(content, now)).toEqual([]);
  });

  test("handles mixed standing, due, and future items", () => {
    const content = [
      "<!-- instruction comment -->",
      "Check emails",
      "2026-02-18T08:00:00Z: Overdue task",
      "2026-12-25T00:00:00Z: Future task",
      "",
      "Review threads",
    ].join("\n");

    const items = parse(content, now);
    expect(items).toHaveLength(3);
    expect(items[0].task).toBe("Check emails");
    expect(items[1].task).toBe("Overdue task");
    expect(items[1].at).toBeDefined();
    expect(items[2].task).toBe("Review threads");
  });

  test("handles timezone offsets in timestamps", () => {
    const content = "2026-02-19T06:00:00-05:00: EST task";
    const items = parse(content, now);
    // 06:00 EST = 11:00 UTC, which is before noon UTC
    expect(items).toHaveLength(1);
    expect(items[0].task).toBe("EST task");
  });

  test("skips lines with invalid timestamps", () => {
    const content = "9999-99-99T99:99:99Z: bad date";
    expect(parse(content, now)).toEqual([]);
  });

  test("strips multiline HTML comments", () => {
    const content = [
      "<!--",
      "This is a multiline comment",
      "spanning several lines",
      "-->",
      "Actual task",
    ].join("\n");
    const items = parse(content, now);
    expect(items).toEqual([{ task: "Actual task" }]);
  });
});
