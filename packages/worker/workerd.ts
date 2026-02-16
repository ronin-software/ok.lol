#!/usr/bin/env bun
/**
 * workerd — the ok.lol worker daemon.
 *
 * Exposes local capabilities over HTTP with HMAC-SHA256 request signing.
 * Every inbound POST must carry a valid X-Signature-256 header.
 * GET / returns the list of available capabilities (no auth).
 *
 * Environment:
 *   WORKER_SECRET  — 256-bit hex-encoded signing key (required)
 *   PORT           — Listen port (default 7420)
 */

import {
  handle,
  hmac,
  type Callable,
  type Result,
  type Yield
} from "@ok.lol/astral";
import * as caps from "./capabilities";

// –
// Configuration
// –

const SECRET = process.env.WORKER_SECRET;
if (!SECRET) {
  console.error("WORKER_SECRET is required");
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 7420);

/** Capability with metadata, for the directory endpoint. */
type RegisteredCapability = Callable & {
  description: string;
  inputSchema: unknown;
  name: string;
};

// Register all exported capabilities.
const capabilities: Record<string, RegisteredCapability> = {};
for (const value of Object.values(caps)) {
  const cap = value as RegisteredCapability;
  capabilities[cap.name] = cap;
}

const dispatch = handle(capabilities);

// –
// Server
// –

Bun.serve({
  port: PORT,
  async fetch(req) {
    // Unauthenticated capability directory with schemas.
    if (req.method === "GET") {
      return Response.json({
        capabilities: Object.values(capabilities).map((c) => ({
          description: c.description,
          inputSchema: c.inputSchema,
          name: c.name,
        })),
      });
    }
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await req.text();

    // Verify signature.
    const sig = req.headers.get(hmac.HEADER);
    if (!sig || !(await hmac.verify(body, sig, SECRET))) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Resolve capability from last path segment.
    const name = new URL(req.url).pathname.split("/").filter(Boolean).pop();
    if (!name || !Object.hasOwn(capabilities, name)) {
      return new Response("Not Found", { status: 404 });
    }

    // Parse input.
    let input: unknown;
    if (body) {
      try {
        input = JSON.parse(body);
      } catch {
        return new Response("Bad Request", { status: 400 });
      }
    }

    return respond(
      dispatch({
        capability: name,
        id: crypto.randomUUID(),
        input,
        type: "call",
      }),
    );
  },
});

console.log(`workerd :${PORT}`);
console.log(`  capabilities: ${Object.keys(capabilities).join(", ")}`);

// –
// Response formatting
// –

/** Convert dispatch frames into an HTTP response (JSON or SSE). */
async function respond(
  frames: AsyncGenerator<Yield | Result>,
): Promise<Response> {
  const first = await frames.next();
  if (first.done) return new Response(null, { status: 204 });

  const frame = first.value;

  // Single result — return JSON.
  if (frame.type === "result") {
    if (frame.error) {
      return Response.json({ error: frame.error }, { status: 500 });
    }
    return Response.json(frame.output);
  }

  // Streaming — SSE.
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify(frame.output)}\n\n`),
        );
        for await (const f of frames) {
          if (f.type === "yield") {
            controller.enqueue(
              enc.encode(`data: ${JSON.stringify(f.output)}\n\n`),
            );
          } else if (f.type === "result" && f.error) {
            controller.enqueue(
              enc.encode(
                `event: error\ndata: ${JSON.stringify(f.error)}\n\n`,
              ),
            );
          }
        }
        controller.close();
      },
    }),
    {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
      },
    },
  );
}
