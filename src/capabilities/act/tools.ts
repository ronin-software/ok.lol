/**
 * Tool registry for the `act` agent loop.
 *
 * Auto-derives AI SDK tools from the capabilities array via `toTool`,
 * wrapping each with automatic logging.
 */

import { assert } from "@/lib/assert";
import { toTool, type Capability } from "@ok.lol/capability";
import type { Tool } from "ai";
import type { OriginExecutionContext } from "../_execution-context";
import { logCall } from "../_log";
import { lookupContact, recordContact } from "../contacts";
import { listDocuments, readDocument, writeDocument } from "../documents";
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

/** Wrap a tool's execute with automatic logging. */
function withLogging(
  name: string,
  baseTool: Tool<unknown, unknown>,
  ectx: OriginExecutionContext,
): Tool<unknown, unknown> {
  const original = baseTool.execute!;
  return {
    ...baseTool,
    execute: async (input: unknown, opts: unknown) => {
      logCall(ectx, name, input).catch(() => {});
      return original(input, opts as Parameters<typeof original>[1]);
    },
  } as Tool<unknown, unknown>;
}

/** Build AI SDK tools and a capabilities listing from origin capabilities. */
export function makeTools(ectx: OriginExecutionContext) {
  assert(ectx.principal.username, "principal must have a username");
  assert(ectx.principal.id, "principal must have an id");

  type AnyOriginCap = Capability<OriginExecutionContext, unknown, unknown>;

  return {
    capabilities,
    tools: Object.fromEntries(
      capabilities.map((c) => {
        const baseTool = toTool(c as AnyOriginCap, ectx);
        return [c.name, withLogging(c.name, baseTool, ectx)];
      }),
    ),
  };
}
