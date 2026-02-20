/**
 * Document access control engine.
 *
 * Enforces dual-gated access: both the document and the contact must
 * allow the operation. An absent allowlist on either side means
 * unrestricted (default-open).
 *
 * Allowlist entry conventions:
 *   @owner          — the account holder
 *   @alice          — contact at contacts/alice.md
 *   #trusted        — any entity tagged "trusted"
 *   soul.md         — exact path match
 *   skills/*        — glob match
 */

import { currentDocuments } from "@/db/documents";
import type { Document } from "@/capabilities/context";
import {
  getAllowList,
  parseFrontmatter,
  type ContactFrontmatter,
  type DocumentFrontmatter,
  type Permission,
} from "./frontmatter";

// –
// Types
// –

/** Resolved identity of the contact in the current interaction. */
export type InteractionContact = {
  /** Contact identifier (filename stem, e.g. "USER" or "alice"). */
  identifier: string;
  /** Whether this is the account owner. */
  isOwner: boolean;
  /** Tags from the contact document's frontmatter. */
  tags: string[];
};

/** The owner contact — unrestricted by convention. */
export const OWNER_CONTACT: InteractionContact = {
  identifier: "USER",
  isOwner: true,
  tags: [],
};

// –
// Core check
// –

/**
 * Check whether a contact is allowed to access a document at a given
 * permission level.
 *
 * Both sides are checked:
 * 1. Document side: if the doc has an allowlist for this permission,
 *    the contact must match.
 * 2. Contact side: if the contact doc has an allowlist for this
 *    permission, the document path must match.
 *
 * Absent allowlist = unrestricted on that side.
 */
export function isAllowed(
  doc: { contents: string; path: string },
  contact: InteractionContact,
  contactFm: ContactFrontmatter,
  permission: Permission,
): boolean {
  // Owner is always allowed.
  if (contact.isOwner) return true;

  // 1. Document-side check.
  const docFm = parseFrontmatter<DocumentFrontmatter>(doc.contents).attributes;
  const docAllow = getAllowList(docFm, permission);
  if (docAllow && !matchesContact(docAllow, contact)) {
    return false;
  }

  // 2. Contact-side check.
  const contactAllow = getAllowList(contactFm, permission);
  if (contactAllow && !matchesPath(contactAllow, doc.path, docFm.tags)) {
    return false;
  }

  return true;
}

/**
 * Filter documents by access control for a given contact and permission.
 * Returns only the documents the contact is allowed to see.
 */
export function filterDocuments(
  documents: Document[],
  contact: InteractionContact,
  contactFm: ContactFrontmatter,
  permission: Permission,
): Document[] {
  if (contact.isOwner) return documents;
  return documents.filter((doc) =>
    isAllowed(doc, contact, contactFm, permission),
  );
}

// –
// Matching
// –

/** Does the contact match any entry in a document's allowlist? */
function matchesContact(
  allowList: string[],
  contact: InteractionContact,
): boolean {
  for (const entry of allowList) {
    if (entry === "@owner" && contact.isOwner) return true;
    if (entry === `@${contact.identifier}`) return true;
    if (entry.startsWith("#") && contact.tags.includes(entry.slice(1))) return true;
  }
  return false;
}

/** Does the document path (or its tags) match any entry in a contact's allowlist? */
function matchesPath(
  allowList: string[],
  path: string,
  docTags?: string[],
): boolean {
  for (const entry of allowList) {
    // Tag match: #public matches any doc tagged "public".
    if (entry.startsWith("#")) {
      if (docTags?.includes(entry.slice(1))) return true;
      continue;
    }
    // Glob: trailing * matches prefix.
    if (entry.endsWith("/*")) {
      const prefix = entry.slice(0, -1); // "skills/" from "skills/*"
      if (path.startsWith(prefix)) return true;
      continue;
    }
    // Exact path match.
    if (entry === path) return true;
  }
  return false;
}

// –
// Contact resolution
// –

/**
 * Resolve an email address to a contact by scanning `contacts/*.md`
 * documents for a matching `emails` entry in frontmatter.
 */
export async function resolveContact(
  principalId: string,
  email: string,
): Promise<InteractionContact | null> {
  const docs = await currentDocuments(principalId);

  for (const doc of docs) {
    if (!doc.path.startsWith("contacts/") || !doc.path.endsWith(".md")) continue;

    const { attributes } = parseFrontmatter<ContactFrontmatter>(doc.contents);
    if (!attributes.emails?.some((e) => e.toLowerCase() === email.toLowerCase())) continue;

    const stem = doc.path.slice("contacts/".length, -".md".length);
    return {
      identifier: stem,
      isOwner: stem === "USER",
      tags: attributes.tags ?? [],
    };
  }

  return null;
}

/**
 * Load the contact frontmatter for an InteractionContact.
 * Returns empty frontmatter if the contact doc doesn't exist.
 */
export async function loadContactFrontmatter(
  principalId: string,
  contact: InteractionContact,
): Promise<ContactFrontmatter> {
  if (contact.isOwner) return {};

  const docs = await currentDocuments(principalId);
  const path = `contacts/${contact.identifier}.md`;
  const doc = docs.find((d) => d.path === path);
  if (!doc) return {};

  return parseFrontmatter<ContactFrontmatter>(doc.contents).attributes;
}
