/**
 * Tool registry for the `act` agent loop.
 *
 * `buildTools(ectx)` is the single entry point — it assembles both origin
 * capabilities and discovered remote worker tools, returning a merged set
 * ready for the model. Workers are imported as internals; callers never
 * need to touch workers.ts directly.
 */

import { assert } from "@/lib/assert";
import { toTool, type Capability } from "@ok.lol/capability";
import type { Tool } from "ai";
import {
  contactList,
  contactLookup,
  contactLookupOwner,
  contactRecord,
  contactSearch,
} from "../contacts";
import type { OriginExecutionContext } from "../context";
import { documentList, documentRead, documentWrite } from "../documents";
import emailSend from "../email/email.send";
import httpGet from "../http";
import { logCall } from "../log";
import {
  followUp,
  threadList,
  threadRead,
  threadSearch,
  threadSummaryExpand,
} from "../threads";
import * as workers from "./workers";

/** Origin capabilities exposed as tools. */
const ORIGIN_CAPABILITIES = [
  contactList,
  contactLookup,
  contactLookupOwner,
  contactRecord,
  contactSearch,
  documentList,
  documentRead,
  documentWrite,
  emailSend,
  followUp,
  httpGet,
  threadList,
  threadRead,
  threadSearch,
  threadSummaryExpand,
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

/**
 * Build all AI SDK tools for the agent loop: origin capabilities + remote
 * worker tools. Discovers workers in parallel with tool construction.
 *
 * Returns merged `tools` (for the model) and `capabilities` (for the prompt
 * directory).
 */
export async function buildTools(ectx: OriginExecutionContext) {
  assert(ectx.principal.username, "principal must have a username");
  assert(ectx.principal.id, "principal must have an id");

  type AnyOriginCap = Capability<OriginExecutionContext, unknown, unknown>;

  const originTools = Object.fromEntries(
    ORIGIN_CAPABILITIES.map((c) => {
      const baseTool = toTool(c as AnyOriginCap, ectx);
      return [c.name, withLogging(c.name, baseTool, ectx)];
    }),
  );

  const endpoints = await workers.discover(ectx.principal.accountId);
  const remote = workers.makeTools(endpoints, {
    accountId: ectx.principal.accountId,
    hireId: ectx.caller?.hireId,
  });

  return {
    capabilities: [...ORIGIN_CAPABILITIES, ...remote.directory],
    tools: { ...originTools, ...remote.tools },
  };
}
