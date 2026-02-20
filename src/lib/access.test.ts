import { describe, expect, test } from "bun:test";
import {
  filterDocuments,
  isAllowed,
  OWNER_CONTACT,
  type InteractionContact,
} from "./access";
import type { ContactFrontmatter } from "./frontmatter";

/** Shorthand for a doc with frontmatter baked into contents. */
function doc(path: string, fm: string, body = "") {
  const contents = fm ? `---\n${fm}\n---\n${body}` : body;
  return { contents, path };
}

/** A contact with no access restrictions. */
const alice: InteractionContact = { identifier: "alice", isOwner: false, tags: ["client"] };
const bob: InteractionContact = { identifier: "bob", isOwner: false, tags: [] };

// –
// Owner bypass
// –

describe("owner bypass", () => {
  test("owner is always allowed regardless of doc restrictions", () => {
    const d = doc("secret.md", 'allow-read:\n  - "@alice"');
    expect(isAllowed(d, OWNER_CONTACT, {}, "read")).toBe(true);
  });

  test("owner is always allowed regardless of permission type", () => {
    const d = doc("locked.md", "allow-write: []");
    expect(isAllowed(d, OWNER_CONTACT, {}, "write")).toBe(true);
    expect(isAllowed(d, OWNER_CONTACT, {}, "visibility")).toBe(true);
    expect(isAllowed(d, OWNER_CONTACT, {}, "context")).toBe(true);
    expect(isAllowed(d, OWNER_CONTACT, {}, "write-meta")).toBe(true);
  });
});

// –
// No allowlists (default-open)
// –

describe("default-open (no allowlists)", () => {
  test("allowed when doc has no frontmatter and contact has no allowlist", () => {
    const d = doc("open.md", "", "Just a doc");
    expect(isAllowed(d, alice, {}, "read")).toBe(true);
    expect(isAllowed(d, alice, {}, "write")).toBe(true);
    expect(isAllowed(d, alice, {}, "context")).toBe(true);
    expect(isAllowed(d, alice, {}, "visibility")).toBe(true);
    expect(isAllowed(d, alice, {}, "write-meta")).toBe(true);
  });

  test("allowed when doc has unrelated frontmatter (tags but no allow-*)", () => {
    const d = doc("tagged.md", "tags:\n  - public");
    expect(isAllowed(d, alice, {}, "read")).toBe(true);
  });
});

// –
// Document-side restrictions
// –

describe("document-side allowlist", () => {
  test("allows contact by @identifier", () => {
    const d = doc("restricted.md", 'allow-read:\n  - "@alice"');
    expect(isAllowed(d, alice, {}, "read")).toBe(true);
    expect(isAllowed(d, bob, {}, "read")).toBe(false);
  });

  test("allows contact by #tag", () => {
    const d = doc("client-only.md", 'allow-read:\n  - "#client"');
    expect(isAllowed(d, alice, {}, "read")).toBe(true);
    expect(isAllowed(d, bob, {}, "read")).toBe(false);
  });

  test("allows @owner entry (only matches isOwner=true)", () => {
    const d = doc("owner-only.md", 'allow-read:\n  - "@owner"');
    expect(isAllowed(d, OWNER_CONTACT, {}, "read")).toBe(true);
    expect(isAllowed(d, alice, {}, "read")).toBe(false);
  });

  test("empty allowlist denies everyone", () => {
    const d = doc("locked.md", "allow-read: []");
    expect(isAllowed(d, alice, {}, "read")).toBe(false);
    expect(isAllowed(d, bob, {}, "read")).toBe(false);
  });

  test("multiple entries: any match grants access", () => {
    const d = doc("multi.md", 'allow-read:\n  - "@bob"\n  - "#client"');
    expect(isAllowed(d, alice, {}, "read")).toBe(true);
    expect(isAllowed(d, bob, {}, "read")).toBe(true);
  });

  test("per-permission granularity", () => {
    const d = doc("mixed.md", 'allow-read:\n  - "@alice"\nallow-write:\n  - "@bob"');
    expect(isAllowed(d, alice, {}, "read")).toBe(true);
    expect(isAllowed(d, alice, {}, "write")).toBe(false);
    expect(isAllowed(d, bob, {}, "read")).toBe(false);
    expect(isAllowed(d, bob, {}, "write")).toBe(true);
  });
});

// –
// Contact-side restrictions
// –

describe("contact-side allowlist", () => {
  test("contact restricted to specific paths", () => {
    const contactFm: ContactFrontmatter = { "allow-read": ["soul.md", "identity.md"] };
    const allowed = doc("soul.md", "", "The soul doc");
    const denied = doc("secret.md", "", "Secret stuff");

    expect(isAllowed(allowed, alice, contactFm, "read")).toBe(true);
    expect(isAllowed(denied, alice, contactFm, "read")).toBe(false);
  });

  test("contact restricted by glob", () => {
    const contactFm: ContactFrontmatter = { "allow-read": ["skills/*"] };
    const d1 = doc("skills/cooking.md", "", "Cooking skill");
    const d2 = doc("secrets/passwords.md", "", "Passwords");

    expect(isAllowed(d1, alice, contactFm, "read")).toBe(true);
    expect(isAllowed(d2, alice, contactFm, "read")).toBe(false);
  });

  test("contact restricted by #tag on document", () => {
    const contactFm: ContactFrontmatter = { "allow-context": ["#public"] };
    const publicDoc = doc("info.md", "tags:\n  - public", "Public info");
    const privateDoc = doc("secret.md", "tags:\n  - sensitive", "Secret");
    const untagged = doc("plain.md", "", "No tags");

    expect(isAllowed(publicDoc, alice, contactFm, "context")).toBe(true);
    expect(isAllowed(privateDoc, alice, contactFm, "context")).toBe(false);
    expect(isAllowed(untagged, alice, contactFm, "context")).toBe(false);
  });

  test("empty contact allowlist denies all docs", () => {
    const contactFm: ContactFrontmatter = { "allow-read": [] };
    const d = doc("anything.md", "", "Content");
    expect(isAllowed(d, alice, contactFm, "read")).toBe(false);
  });
});

// –
// Dual-gated (both sides)
// –

describe("dual-gated access", () => {
  test("both sides must agree", () => {
    // Doc allows alice; contact allows soul.md only.
    const d = doc("soul.md", 'allow-read:\n  - "@alice"');
    const contactFm: ContactFrontmatter = { "allow-read": ["soul.md"] };
    expect(isAllowed(d, alice, contactFm, "read")).toBe(true);
  });

  test("denied when doc allows but contact doesn't", () => {
    const d = doc("secret.md", 'allow-read:\n  - "@alice"');
    const contactFm: ContactFrontmatter = { "allow-read": ["soul.md"] };
    expect(isAllowed(d, alice, contactFm, "read")).toBe(false);
  });

  test("denied when contact allows but doc doesn't", () => {
    const d = doc("soul.md", 'allow-read:\n  - "@bob"');
    const contactFm: ContactFrontmatter = { "allow-read": ["soul.md"] };
    expect(isAllowed(d, alice, contactFm, "read")).toBe(false);
  });

  test("one side open, other side restricted — respects the restriction", () => {
    // Doc has no allowlist (open); contact restricts to skills/*.
    const d = doc("secret.md", "", "No restriction");
    const contactFm: ContactFrontmatter = { "allow-read": ["skills/*"] };
    expect(isAllowed(d, alice, contactFm, "read")).toBe(false);
  });
});

// –
// filterDocuments
// –

describe("filterDocuments", () => {
  const docs = [
    { contents: "---\ntags:\n  - public\n---\nPublic", path: "info.md", priority: 0 },
    { contents: "---\ntags:\n  - sensitive\n---\nSecret", path: "secret.md", priority: 0 },
    { contents: "Plain doc", path: "plain.md", priority: 0 },
  ];

  test("owner gets all documents", () => {
    const result = filterDocuments(docs, OWNER_CONTACT, {}, "context");
    expect(result).toHaveLength(3);
  });

  test("contact with #public restriction gets only public doc", () => {
    const contactFm: ContactFrontmatter = { "allow-context": ["#public"] };
    const result = filterDocuments(docs, alice, contactFm, "context");
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe("info.md");
  });

  test("contact with no restrictions gets all docs", () => {
    const result = filterDocuments(docs, alice, {}, "context");
    expect(result).toHaveLength(3);
  });

  test("returns empty for empty allowlist", () => {
    const contactFm: ContactFrontmatter = { "allow-context": [] };
    const result = filterDocuments(docs, alice, contactFm, "context");
    expect(result).toHaveLength(0);
  });
});

// –
// Permission independence
// –

describe("permission independence", () => {
  test("write restriction doesn't affect read", () => {
    const d = doc("notes.md", 'allow-write:\n  - "@bob"');
    expect(isAllowed(d, alice, {}, "read")).toBe(true);
    expect(isAllowed(d, alice, {}, "write")).toBe(false);
  });

  test("visibility restriction doesn't affect context", () => {
    const d = doc("data.md", 'allow-visibility:\n  - "@bob"');
    expect(isAllowed(d, alice, {}, "context")).toBe(true);
    expect(isAllowed(d, alice, {}, "visibility")).toBe(false);
  });

  test("write-meta is independent of write", () => {
    const d = doc("important.md", 'allow-write:\n  - "@alice"\nallow-write-meta:\n  - "@bob"');
    expect(isAllowed(d, alice, {}, "write")).toBe(true);
    expect(isAllowed(d, alice, {}, "write-meta")).toBe(false);
    expect(isAllowed(d, bob, {}, "write")).toBe(false);
    expect(isAllowed(d, bob, {}, "write-meta")).toBe(true);
  });
});

// –
// Tag matching edge cases
// –

describe("tag edge cases", () => {
  test("contact with multiple tags matches any", () => {
    const multi: InteractionContact = { identifier: "charlie", isOwner: false, tags: ["admin", "client"] };
    const d = doc("admin-only.md", 'allow-read:\n  - "#admin"');
    expect(isAllowed(d, multi, {}, "read")).toBe(true);
  });

  test("tag match is exact (no partial)", () => {
    const d = doc("data.md", 'allow-read:\n  - "#cli"');
    expect(isAllowed(d, alice, {}, "read")).toBe(false); // alice has "client", not "cli"
  });
});

// –
// Glob matching edge cases
// –

describe("glob edge cases", () => {
  test("skills/* matches skills/cooking.md", () => {
    const contactFm: ContactFrontmatter = { "allow-read": ["skills/*"] };
    const d = doc("skills/cooking.md", "");
    expect(isAllowed(d, bob, contactFm, "read")).toBe(true);
  });

  test("skills/* matches nested skills/advanced/baking.md", () => {
    const contactFm: ContactFrontmatter = { "allow-read": ["skills/*"] };
    const d = doc("skills/advanced/baking.md", "");
    expect(isAllowed(d, bob, contactFm, "read")).toBe(true);
  });

  test("skills/* does not match skillsets/other.md", () => {
    const contactFm: ContactFrontmatter = { "allow-read": ["skills/*"] };
    const d = doc("skillsets/other.md", "");
    expect(isAllowed(d, bob, contactFm, "read")).toBe(false);
  });

  test("exact path match works", () => {
    const contactFm: ContactFrontmatter = { "allow-read": ["soul.md"] };
    const d = doc("soul.md", "");
    expect(isAllowed(d, bob, contactFm, "read")).toBe(true);
  });

  test("exact path doesn't partial-match", () => {
    const contactFm: ContactFrontmatter = { "allow-read": ["soul.md"] };
    const d = doc("soul.md.bak", "");
    expect(isAllowed(d, bob, contactFm, "read")).toBe(false);
  });
});
