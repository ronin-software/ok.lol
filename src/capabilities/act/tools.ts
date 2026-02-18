/**
 * Tool registry for the `act` agent loop.
 *
 * Each origin capability that should be exposed as a tool is registered
 * here. `toTool` from `@ok.lol/capability` derives AI SDK tools from
 * capabilities.
 */

import { toTool } from "@ok.lol/capability";
import { assert } from "@/lib/assert";
import { lookupContact, recordContact } from "../contacts";
import { listDocuments, readDocument, writeDocument } from "../documents";
import type { OriginExecutionContext } from "../_execution-context";
import emailSend from "../email/email.send";
import {
  expandSummary,
  followUp,
  listThreads,
  readThread,
  searchThreads,
} from "../threads";

/** Origin capabilities exposed as tools. */
const capabilities = [
  emailSend,
  expandSummary,
  followUp,
  listDocuments,
  listThreads,
  lookupContact,
  readDocument,
  readThread,
  recordContact,
  searchThreads,
  writeDocument,
];

/** Build AI SDK tools and a capabilities listing from origin capabilities. */
export function makeTools(ectx: OriginExecutionContext) {
  assert(ectx.principal.username, "principal must have a username");
  assert(ectx.principal.id, "principal must have an id");

  return {
    capabilities,
    tools: {
      [emailSend.name]: toTool(emailSend, ectx),
      [expandSummary.name]: toTool(expandSummary, ectx),
      [followUp.name]: toTool(followUp, ectx),
      [listDocuments.name]: toTool(listDocuments, ectx),
      [listThreads.name]: toTool(listThreads, ectx),
      [lookupContact.name]: toTool(lookupContact, ectx),
      [readDocument.name]: toTool(readDocument, ectx),
      [readThread.name]: toTool(readThread, ectx),
      [recordContact.name]: toTool(recordContact, ectx),
      [searchThreads.name]: toTool(searchThreads, ectx),
      [writeDocument.name]: toTool(writeDocument, ectx),
    },
  };
}
