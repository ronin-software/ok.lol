import { describe, expect, test } from "bun:test";
import {
  getAllowList,
  parseFrontmatter,
  serializeFrontmatter,
  type ContactFrontmatter,
  type DocumentFrontmatter,
} from "./frontmatter";

// –
// parseFrontmatter
// –

describe("parseFrontmatter", () => {
  test("returns empty attributes and full body when no frontmatter", () => {
    const { attributes, body } = parseFrontmatter("# Hello\nWorld");
    expect(attributes).toEqual({});
    expect(body).toBe("# Hello\nWorld");
  });

  test("parses tags from frontmatter", () => {
    const content = `---\ntags:\n  - public\n  - sensitive\n---\n# Doc`;
    const { attributes, body } = parseFrontmatter(content);
    expect(attributes.tags).toEqual(["public", "sensitive"]);
    expect(body).toBe("# Doc");
  });

  test("parses access control lists", () => {
    const content = [
      "---",
      "allow-read:",
      '  - "@alice"',
      '  - "#trusted"',
      "allow-write:",
      '  - "@owner"',
      "---",
      "Body text",
    ].join("\n");
    const { attributes, body } = parseFrontmatter(content);
    expect(attributes["allow-read"]).toEqual(["@alice", "#trusted"]);
    expect(attributes["allow-write"]).toEqual(["@owner"]);
    expect(body).toBe("Body text");
  });

  test("parses contact frontmatter with emails and handles", () => {
    const content = [
      "---",
      "emails:",
      "  - alice@example.com",
      "  - alice@work.com",
      "handles:",
      "  github: alice",
      "tags:",
      "  - client",
      "---",
      "Notes about Alice.",
    ].join("\n");
    const { attributes, body } = parseFrontmatter<ContactFrontmatter>(content);
    expect(attributes.emails).toEqual(["alice@example.com", "alice@work.com"]);
    expect(attributes.handles).toEqual({ github: "alice" });
    expect(attributes.tags).toEqual(["client"]);
    expect(body).toBe("Notes about Alice.");
  });

  test("handles unclosed frontmatter as no frontmatter", () => {
    const content = "---\ntags:\n  - broken";
    const { attributes, body } = parseFrontmatter(content);
    expect(attributes).toEqual({});
    expect(body).toBe(content);
  });

  test("handles empty frontmatter block (newline-separated)", () => {
    const content = "---\n\n---\nBody";
    const { attributes, body } = parseFrontmatter(content);
    expect(attributes).toEqual({});
    expect(body).toBe("Body");
  });

  test("adjacent fences with no gap treated as no frontmatter", () => {
    const content = "---\n---\nBody";
    const { attributes, body } = parseFrontmatter(content);
    expect(attributes).toEqual({});
    expect(body).toBe(content);
  });

  test("handles content that doesn't start with ---", () => {
    const { attributes, body } = parseFrontmatter("Not frontmatter\n---\nstill not");
    expect(attributes).toEqual({});
    expect(body).toBe("Not frontmatter\n---\nstill not");
  });

  test("preserves body with multiple paragraphs", () => {
    const content = "---\ntags:\n  - a\n---\nParagraph 1\n\nParagraph 2";
    const { body } = parseFrontmatter(content);
    expect(body).toBe("Paragraph 1\n\nParagraph 2");
  });

  test("empty string returns empty", () => {
    const { attributes, body } = parseFrontmatter("");
    expect(attributes).toEqual({});
    expect(body).toBe("");
  });
});

// –
// serializeFrontmatter
// –

describe("serializeFrontmatter", () => {
  test("returns body only when no attributes", () => {
    expect(serializeFrontmatter({}, "Hello")).toBe("Hello");
  });

  test("returns body only when all attributes are undefined", () => {
    expect(serializeFrontmatter({ tags: undefined } as Record<string, unknown>, "Hello")).toBe("Hello");
  });

  test("serializes simple scalar attributes", () => {
    const result = serializeFrontmatter({ priority: 10 }, "Body");
    expect(result).toContain("---");
    expect(result).toContain("priority: 10");
    expect(result).toEndWith("\n---\nBody");
  });

  test("serializes array attributes", () => {
    const result = serializeFrontmatter({ emails: ["a@b.com", "c@d.com"] }, "Body");
    expect(result).toContain('  - "a@b.com"');
    expect(result).toContain('  - "c@d.com"');
  });

  test("serializes object attributes", () => {
    const result = serializeFrontmatter({ handles: { github: "alice" } }, "Body");
    expect(result).toContain('  github: "alice"');
  });

  test("roundtrips with parseFrontmatter", () => {
    const attrs: ContactFrontmatter = {
      emails: ["alice@example.com"],
      tags: ["client"],
    };
    const body = "# Alice\nNotes.";
    const serialized = serializeFrontmatter(attrs, body);
    const parsed = parseFrontmatter<ContactFrontmatter>(serialized);

    expect(parsed.attributes.emails).toEqual(["alice@example.com"]);
    expect(parsed.attributes.tags).toEqual(["client"]);
    expect(parsed.body).toBe(body);
  });

  test("sorts keys alphabetically", () => {
    const result = serializeFrontmatter({ tags: ["a"], emails: ["b@c.com"] }, "");
    const lines = result.split("\n");
    const emailsIdx = lines.findIndex((l) => l.startsWith("emails:"));
    const tagsIdx = lines.findIndex((l) => l.startsWith("tags:"));
    expect(emailsIdx).toBeLessThan(tagsIdx);
  });
});

// –
// getAllowList
// –

describe("getAllowList", () => {
  test("returns the allow list for a permission", () => {
    const fm: DocumentFrontmatter = { "allow-read": ["@alice", "#trusted"] };
    expect(getAllowList(fm, "read")).toEqual(["@alice", "#trusted"]);
  });

  test("returns undefined when no list defined", () => {
    expect(getAllowList({}, "read")).toBeUndefined();
    expect(getAllowList({}, "write")).toBeUndefined();
    expect(getAllowList({}, "context")).toBeUndefined();
    expect(getAllowList({}, "visibility")).toBeUndefined();
    expect(getAllowList({}, "write-meta")).toBeUndefined();
  });

  test("returns empty array when explicitly empty", () => {
    const fm: DocumentFrontmatter = { "allow-read": [] };
    expect(getAllowList(fm, "read")).toEqual([]);
  });
});
