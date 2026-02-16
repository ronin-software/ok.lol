/**
 * Worker discovery and remote tool generation.
 *
 * Probes each registered worker's capability directory (GET /),
 * then builds AI SDK tools that sign and forward calls via HMAC.
 * Offline workers are silently skipped.
 */

import { db } from "@/db";
import { worker } from "@/db/schema";
import { hmac } from "@ok.lol/astral";
import type { CapabilitySpec } from "@ok.lol/capability";
import { tool } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { JSONSchema } from "zod/v4/core";

/** Shape returned by a worker's GET / directory endpoint. */
type WireCapability = CapabilitySpec & {
  /** JSONSchema-serialized input schema. */
  inputSchema: JSONSchema.JSONSchema;
  /** JSONSchema-serialized output schema. */
  outputSchema: JSONSchema.JSONSchema;
};

/** A reachable worker with its discovered capabilities. */
type Endpoint = {
  capabilities: WireCapability[];
  name: string;
  secret: string;
  url: string;
};

/** Timeout for probing a worker's directory endpoint. */
const PROBE_TIMEOUT_MS = 3_000;

// –
// Discovery
// –

/** Probe all registered workers for an account. Returns only those online. */
export async function discover(accountId: string): Promise<Endpoint[]> {
  const rows = await db
    .select({ name: worker.name, secret: worker.secret, url: worker.url })
    .from(worker)
    .where(eq(worker.accountId, accountId));

  if (rows.length === 0) return [];

  const results: Endpoint[] = [];

  await Promise.all(
    rows.map(async (row) => {
      try {
        const res = await fetch(row.url, {
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        if (!res.ok) return;

        const body = (await res.json()) as { capabilities?: unknown };
        if (!Array.isArray(body.capabilities)) return;

        // Filter to capabilities with full wire metadata.
        const valid = body.capabilities.filter(
          (c): c is WireCapability =>
            c != null &&
            typeof c === "object" &&
            typeof (c as Record<string, unknown>).name === "string" &&
            (c as Record<string, unknown>).inputSchema != null &&
            (c as Record<string, unknown>).outputSchema != null,
        );
        if (valid.length === 0) return;

        results.push({
          capabilities: valid,
          name: row.name,
          secret: row.secret,
          url: row.url.replace(/\/$/, ""),
        });
      } catch {
        // Worker offline or unreachable — skip.
      }
    }),
  );

  return results;
}

// –
// Tool generation
// –

/** Sanitize a name for use in AI SDK tool identifiers. */
function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
}

/**
 * Build AI SDK tools and directory entries for all discovered worker capabilities.
 *
 * Tool names are `<worker>_<capability>` to avoid collisions with origin tools
 * and between workers. Each tool signs and POSTs to the worker.
 */
export function makeTools(endpoints: Endpoint[]) {
  const tools: Record<string, ReturnType<typeof tool<unknown, unknown>>> = {};
  const directory: CapabilitySpec[] = [];

  for (const ep of endpoints) {
    const prefix = sanitize(ep.name);

    for (const cap of ep.capabilities) {
      const name = `${prefix}_${cap.name}`;
      const description = `[worker: ${ep.name}] ${cap.description}`;

      tools[name] = tool({
        description,
        execute: callWorker(ep.url, ep.secret, cap.name),
        inputSchema: z.fromJSONSchema(cap.inputSchema),
        outputSchema: z.fromJSONSchema(cap.outputSchema),
      });

      directory.push({ description, name });
    }
  }

  return { directory, tools };
}

/** Create an execute function that signs and forwards a call to a worker. */
function callWorker(
  baseUrl: string,
  secret: string,
  capability: string,
): (input: unknown) => Promise<unknown> {
  return async (input) => {
    const body = JSON.stringify(input);
    const sig = await hmac.sign(body, secret);

    const res = await fetch(`${baseUrl}/${capability}`, {
      body,
      headers: {
        "Content-Type": "application/json",
        [hmac.HEADER]: sig,
      },
      method: "POST",
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: res.statusText }))) as {
        error?: string;
      };
      return { error: err.error ?? res.statusText };
    }

    return res.json();
  };
}
