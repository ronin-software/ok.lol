/**
 * Contact capabilities — look up and record known people.
 *
 * Structured identity (name, email, relationship) lives in the contact table.
 * Narrative notes live in documents at the conventional path `contacts/{email}`,
 * written and read via the existing document tools.
 */

import {
  allContacts,
  findContact,
  findOwnerContact,
  searchContacts as searchContactsDB,
  upsertContact,
} from "@/db/contacts";
import type { Capability } from "@ok.lol/capability";
import { z } from "zod";
import type { OriginExecutionContext } from "../context";

// –
// List
// –

const contactRow = z.object({
  email: z.string().nullable(),
  name: z.string().nullable(),
  relationship: z.string(),
});

const listOutput = z.array(contactRow);

type ListOutput = z.infer<typeof listOutput>;

/** Return every contact for the current principal. */
export const contactList: Capability<OriginExecutionContext, Record<string, never>, ListOutput> = {
  async call(ectx) {
    return allContacts(ectx.principal.id);
  },

  description:
    "List all known contacts — names, emails, and relationships (owner/contact).",
  name: "contact_list",

  inputSchema: z.object({}),
  outputSchema: listOutput,
};

// –
// Search
// –

const searchInput = z.object({
  /** Substring to match against name or email. */
  query: z.string().min(1),
});

const searchOutput = z.array(contactRow);

type SearchInput = z.infer<typeof searchInput>;
type SearchOutput = z.infer<typeof searchOutput>;

/** Search contacts by name or email (case-insensitive substring match). */
export const contactSearch: Capability<OriginExecutionContext, SearchInput, SearchOutput> = {
  async call(ectx, input) {
    return searchContactsDB(ectx.principal.id, input.query);
  },

  description:
    "Search contacts by name or email. Returns matching contacts.",
  name: "contact_search",

  inputSchema: searchInput,
  outputSchema: searchOutput,
};

// –
// Lookup
// –

const lookupInput = z.object({
  /** Email address to look up. */
  email: z.string().email(),
});

const lookupOutput = z.object({
  /** True when the contact is the account holder. */
  isOwner: z.boolean(),
  name: z.string().nullable(),
  /** Read/write notes about this person at this document path. */
  notesPath: z.string(),
  relationship: z.string(),
}).nullable();

type LookupInput = z.infer<typeof lookupInput>;
type LookupOutput = z.infer<typeof lookupOutput>;

/**
 * Look up a contact by email. Use before acting on a message to determine
 * trust level (owner vs unknown) and to find existing notes.
 * Returns null if the email is not in the contact list.
 */
export const contactLookup: Capability<OriginExecutionContext, LookupInput, LookupOutput> = {
  async call(ectx, input) {
    const row = await findContact(ectx.principal.id, input.email);
    if (!row) return null;
    return {
      isOwner: row.relationship === "owner",
      name: row.name,
      notesPath: `contacts/${input.email}`,
      relationship: row.relationship,
    };
  },

  description:
    "Look up a contact by email — returns their name, relationship (owner/contact), " +
    "and the document path for notes. Returns null if unknown.",
  name: "contact_lookup",

  inputSchema: lookupInput,
  outputSchema: lookupOutput,
};

// –
// Record
// –

const recordInput = z.object({
  email: z.string().email().describe("Contact's email address"),
  name: z.string().optional().describe("Contact's name, if known"),
});

type RecordInput = z.infer<typeof recordInput>;

/** Add a new contact or confirm an existing one. Does not overwrite existing records. */
export const contactRecord: Capability<OriginExecutionContext, RecordInput, void> = {
  async call(ectx, input) {
    await upsertContact(ectx.principal.id, input);
  },

  description: "Record a new contact (name + email). No-op if the contact already exists.",
  name: "contact_record",

  inputSchema: recordInput,
  outputSchema: z.void(),
};

// –
// Owner
// –

const ownerOutput = z.object({
  email: z.string(),
  name: z.string().nullable(),
}).nullable();

type OwnerOutput = z.infer<typeof ownerOutput>;

/**
 * Look up the account holder (owner) for the current principal.
 * Zero-input tool — the principal is implicit from the execution context.
 */
export const contactLookupOwner: Capability<OriginExecutionContext, Record<string, never>, OwnerOutput> = {
  async call(ectx) {
    const row = await findOwnerContact(ectx.principal.id);
    if (!row || !row.email) return null;
    return { email: row.email, name: row.name };
  },

  description:
    "Look up the account holder's email and name. " +
    "Use this when you need to contact or identify the owner without knowing their email.",
  name: "contact_lookup_owner",

  inputSchema: z.object({}),
  outputSchema: ownerOutput,
};
