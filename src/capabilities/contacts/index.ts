/**
 * Contact capabilities — look up and record known people.
 *
 * Structured identity (name, email, relationship) lives in the contact table.
 * Narrative notes live in documents at the conventional path `contacts/{email}`,
 * written and read via the existing document tools.
 */

import { findContact, upsertContact } from "@/db/contacts";
import type { Capability } from "@ok.lol/capability";
import { z } from "zod";
import type { OriginExecutionContext } from "../_execution-context";

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
export const lookupContact: Capability<OriginExecutionContext, LookupInput, LookupOutput> = {
  available: async () => true,
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
  setup: async () => {},

  description:
    "Look up a contact by email — returns their name, relationship (owner/contact), " +
    "and the document path for notes. Returns null if unknown.",
  name: "lookup_contact",

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
export const recordContact: Capability<OriginExecutionContext, RecordInput, void> = {
  available: async () => true,
  async call(ectx, input) {
    await upsertContact(ectx.principal.id, input);
  },
  setup: async () => {},

  description: "Record a new contact (name + email). No-op if the contact already exists.",
  name: "record_contact",

  inputSchema: recordInput,
  outputSchema: z.void(),
};
