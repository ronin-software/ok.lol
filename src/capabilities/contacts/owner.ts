/**
 * Look up the account holder (owner) for the current principal.
 *
 * Zero-input tool — the principal is implicit from the execution context.
 */

import { findOwnerContact } from "@/db/contacts";
import type { Capability } from "@ok.lol/capability";
import { z } from "zod";
import type { OriginExecutionContext } from "../_execution-context";

const input = z.object({});

const output = z.object({
  email: z.string(),
  name: z.string().nullable(),
}).nullable();

type Input = z.infer<typeof input>;
type Output = z.infer<typeof output>;

const lookupOwner: Capability<OriginExecutionContext, Input, Output> = {
  async call(ectx) {
    const row = await findOwnerContact(ectx.principal.id);
    if (!row) return null;
    return { email: row.email, name: row.name };
  },

  description:
    "Look up the account holder's email and name. " +
    "Use this when you need to contact or identify the owner without knowing their email.",
  name: "lookup_owner",

  inputSchema: input,
  outputSchema: output,
};

export default lookupOwner;
