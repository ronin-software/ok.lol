import { describe, expect, test } from "bun:test";
import { packExtra, parse, serialize, unpackExtra } from "./frontmatter";

describe("parse", () => {
  test("no frontmatter returns body as-is", () => {
    const result = parse("hello world");
    expect(result.body).toBe("hello world");
    expect(result.priority).toBe(0);
    expect(result.extra).toEqual([]);
    expect(result.activation).toBeUndefined();
  });

  test("extracts known fields", () => {
    const text = [
      "---",
      "priority: 5",
      "inject-when:",
      "  - greeting",
      "  - hello",
      "suppress-when:",
      "  - goodbye",
      "---",
      "Body here",
    ].join("\n");

    const result = parse(text);
    expect(result.priority).toBe(5);
    expect(result.activation?.positive).toEqual(["greeting", "hello"]);
    expect(result.activation?.negative).toEqual(["goodbye"]);
    expect(result.body).toBe("Body here");
    expect(result.extra).toEqual([]);
  });

  test("preserves arbitrary fields in extra", () => {
    const text = [
      "---",
      "priority: 1",
      'summary: "Workspace template for AGENTS.md"',
      "inject_when:",
      "  - Bootstrapping a workspace manually",
      "---",
      "Body text",
    ].join("\n");

    const result = parse(text);
    expect(result.priority).toBe(1);
    expect(result.body).toBe("Body text");
    expect(result.extra).toEqual([
      'summary: "Workspace template for AGENTS.md"',
      "inject_when:",
      "  - Bootstrapping a workspace manually",
    ]);
  });

  test("strips known help comments", () => {
    const text = [
      "---",
      "# injection order (lower = first)",
      "priority: 3",
      "# phrases that trigger injection",
      "inject-when: []",
      "# phrases that suppress injection",
      "suppress-when: []",
      "---",
      "Body",
    ].join("\n");

    const result = parse(text);
    expect(result.priority).toBe(3);
    expect(result.body).toBe("Body");
    expect(result.extra).toEqual([]);
  });
});

describe("serialize", () => {
  test("always includes all known fields", () => {
    const text = serialize("Body", 0);
    expect(text).toContain("priority: 0");
    expect(text).toContain("inject-when: []");
    expect(text).toContain("suppress-when: []");
    expect(text).toContain("Body");
  });

  test("emits activation lists", () => {
    const text = serialize("Body", 2, {
      negative: ["farewell"],
      positive: ["greet", "hi"],
    });
    expect(text).toContain("priority: 2");
    expect(text).toContain("inject-when:");
    expect(text).toContain("  - greet");
    expect(text).toContain("  - hi");
    expect(text).toContain("suppress-when:");
    expect(text).toContain("  - farewell");
  });

  test("appends extra fields after known fields", () => {
    const text = serialize("Body", 0, undefined, [
      'summary: "A thing"',
      "tags:",
      "  - ai",
    ]);
    expect(text).toContain("suppress-when: []");
    expect(text).toContain('summary: "A thing"');
    // Extra fields come after known fields, inside the fences.
    const fenceIndices = [...text.matchAll(/^---$/gm)].map((m) => m.index);
    expect(fenceIndices).toHaveLength(2);
    const block = text.slice(fenceIndices[0]!, fenceIndices[1]!);
    expect(block).toContain('summary: "A thing"');
    expect(block).toContain("  - ai");
  });
});

describe("round-trip", () => {
  test("parse → serialize is stable", () => {
    const original = serialize("My document body\n", 3, {
      positive: ["planning"],
    }, ['summary: "Test doc"']);

    const parsed = parse(original);
    const reserialized = serialize(
      parsed.body,
      parsed.priority,
      parsed.activation,
      parsed.extra,
    );

    expect(reserialized).toBe(original);
  });

  test("full save/load round-trip with packExtra/unpackExtra", () => {
    const editorText = [
      "---",
      "# injection order (lower = first)",
      "priority: 1",
      "# phrases that trigger injection",
      "inject-when: []",
      "# phrases that suppress injection",
      "suppress-when: []",
      "",
      'summary: "Workspace template for AGENTS.md"',
      "inject_when:",
      "  - Bootstrapping a workspace manually",
      "---",
      "Document body here",
    ].join("\n");

    // Save: parse editor text, pack extra into stored content.
    const { activation, body, extra, priority } = parse(editorText);
    const storedContent = packExtra(extra, body);

    expect(priority).toBe(1);
    expect(body).toBe("Document body here");
    expect(extra).toEqual([
      'summary: "Workspace template for AGENTS.md"',
      "inject_when:",
      "  - Bootstrapping a workspace manually",
    ]);

    // Load: unpack extra from stored content, serialize for editor.
    const unpacked = unpackExtra(storedContent);
    const reloaded = serialize(
      unpacked.body,
      priority,
      activation,
      unpacked.extra,
    );

    expect(reloaded).toBe(editorText);
  });

  test("documents without extra round-trip cleanly", () => {
    const editorText = serialize("Simple body\n", 0);
    const { activation, body, extra, priority } = parse(editorText);
    const stored = packExtra(extra, body);

    // No extra → stored content is just the body.
    expect(stored).toBe("Simple body\n");

    const unpacked = unpackExtra(stored);
    const reloaded = serialize(unpacked.body, priority, activation, unpacked.extra);
    expect(reloaded).toBe(editorText);
  });
});
