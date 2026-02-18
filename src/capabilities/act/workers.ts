/**
 * Worker discovery and remote tool generation.
 *
 * Probes each registered worker's capability directory (GET /),
 * persists the reported hostname, then builds AI SDK tools that
 * sign and forward calls via HMAC. Offline workers are silently skipped.
 */

import { db } from "@/db";
import { worker } from "@/db/schema";
import { recordUsage } from "@/lib/billing";
import { probe, tunnelHeaders } from "@/lib/tunnel";
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
  /** Account that owns this worker. */
  accountId: string;
  capabilities: WireCapability[];
  name: string;
  secret: string;
  url: string;
};

// –
// Discovery
// –

/** Probe all registered workers for an account. Returns only those online. */
export async function discover(accountId: string): Promise<Endpoint[]> {
  const rows = await db
    .select({
      id: worker.id,
      secret: worker.secret,
      url: worker.url,
    })
    .from(worker)
    .where(eq(worker.accountId, accountId));

  if (rows.length === 0) return [];

  const results: Endpoint[] = [];

  await Promise.all(
    rows.map(async (row) => {
      const body = await probe(row.url);
      if (!body || !Array.isArray(body.capabilities)) return;

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

      // Persist the worker-reported hostname.
      const wireName = typeof body.name === "string" ? body.name : null;
      if (wireName) {
        await db
          .update(worker)
          .set({ name: wireName })
          .where(eq(worker.id, row.id));
      }

      results.push({
        accountId,
        capabilities: valid,
        name: wireName ?? row.id,
        secret: row.secret,
        url: row.url.replace(/\/$/, ""),
      });
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

/** Billing context threaded into each tool's execute closure. */
type BillingContext = {
  accountId: string;
  hireId?: string;
};

/**
 * Build AI SDK tools and directory entries for all discovered worker capabilities.
 *
 * Tool names are `<worker>_<capability>` to avoid collisions with origin tools
 * and between workers. Each tool signs and POSTs to the worker.
 */
export function makeTools(endpoints: Endpoint[], billing?: BillingContext) {
  const tools: Record<string, ReturnType<typeof tool<unknown, unknown>>> = {};
  const directory: CapabilitySpec[] = [];

  for (const ep of endpoints) {
    const prefix = sanitize(ep.name);
    const ctx = billing ?? { accountId: ep.accountId };

    for (const cap of ep.capabilities) {
      const name = `${prefix}_${cap.name}`;
      const description = `[worker: ${ep.name}] ${cap.description}`;

      tools[name] = tool({
        description,
        execute: callWorker(ep.url, ep.secret, cap.name, ctx),
        inputSchema: z.fromJSONSchema(cap.inputSchema),
        outputSchema: z.fromJSONSchema(cap.outputSchema),
      });

      directory.push({ description, name });
    }
  }

  return { directory, tools };
}

// –
// Egress metering
// –

/**
 * Fly region → egress pricing tier.
 *
 * Rates in micro-USD per byte:
 *   $0.02/GB → 0.00002   (NA, EU)
 *   $0.04/GB → 0.00004   (APAC, Oceania, SA)
 *   $0.12/GB → 0.00012   (Africa, India)
 */
const REGION_TIER: Record<string, number> = {
  // North America
  atl: 0.00002, bos: 0.00002, den: 0.00002, dfw: 0.00002,
  ewr: 0.00002, iad: 0.00002, lax: 0.00002, mia: 0.00002,
  ord: 0.00002, phx: 0.00002, sea: 0.00002, sjc: 0.00002,
  yul: 0.00002, yyz: 0.00002,
  // Europe
  ams: 0.00002, arn: 0.00002, cdg: 0.00002, fra: 0.00002,
  lhr: 0.00002, mad: 0.00002, otp: 0.00002, waw: 0.00002,
  // Asia Pacific / Oceania
  hkg: 0.00004, nrt: 0.00004, sin: 0.00004, syd: 0.00004,
  // South America
  gig: 0.00004, gru: 0.00004, scl: 0.00004,
  // Africa
  jnb: 0.00012,
  // India
  bom: 0.00012, maa: 0.00012,
};

const DEFAULT_RATE = 0.00002;
const PLATFORM_FEE = 1.05;

/** Record tunnel egress for a single worker call. */
async function recordEgress(
  ctx: BillingContext,
  requestBytes: number,
  responseBytes: number,
  region: string | null,
) {
  const totalBytes = requestBytes + responseBytes;
  if (totalBytes <= 0) return;

  const rate = (region ? REGION_TIER[region] : undefined) ?? DEFAULT_RATE;
  const cost = BigInt(Math.ceil(totalBytes * rate * PLATFORM_FEE));

  await recordUsage({
    accountId: ctx.accountId,
    amount: BigInt(totalBytes),
    cost,
    hireId: ctx.hireId,
    resource: "tunnel:egress",
  });
}

// –
// Remote calls
// –

/** Create an execute function that signs and forwards a call to a worker. */
function callWorker(
  baseUrl: string,
  secret: string,
  capability: string,
  ctx: BillingContext,
): (input: unknown) => Promise<unknown> {
  return async (input) => {
    const body = JSON.stringify(input);
    const sig = await hmac.sign(body, secret);

    const res = await fetch(`${baseUrl}/${capability}`, {
      body,
      headers: {
        "Content-Type": "application/json",
        [hmac.HEADER]: sig,
        ...tunnelHeaders(),
      },
      method: "POST",
    });

    const responseText = await res.text();
    const region = res.headers.get("fly-region");

    recordEgress(ctx, body.length, responseText.length, region).catch(() => {});

    if (!res.ok) {
      const err = (() => {
        try { return JSON.parse(responseText) as { error?: string }; }
        catch { return { error: res.statusText }; }
      })();
      return { error: err.error ?? res.statusText };
    }

    try { return JSON.parse(responseText); }
    catch { return { error: "invalid response" }; }
  };
}
