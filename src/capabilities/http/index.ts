/**
 * HTTP GET capability — fetch a public URL and return its body.
 *
 * Constraints: 10s timeout, 64 KB body limit, rejects file:// and private IPs.
 */

import type { Capability } from "@ok.lol/capability";
import { z } from "zod";
import type { OriginExecutionContext } from "../_execution-context";

const MAX_BODY = 64 * 1024;
const TIMEOUT_MS = 10_000;

// RFC 1918 + loopback + link-local prefixes.
const PRIVATE_PREFIXES = [
  "10.", "172.16.", "172.17.", "172.18.", "172.19.",
  "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
  "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
  "172.30.", "172.31.", "192.168.", "127.", "0.",
  "169.254.",
];

const input = z.object({
  /** The URL to fetch. Must be http:// or https://. */
  url: z.string().url(),
});

const output = z.object({
  body: z.string(),
  status: z.number(),
});

type Input = z.infer<typeof input>;
type Output = z.infer<typeof output>;

/** Reject schemes and private-range hosts before fetching. */
export function validateUrl(raw: string): URL {
  const url = new URL(raw);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }

  const host = url.hostname;
  if (host === "localhost" || PRIVATE_PREFIXES.some((p) => host.startsWith(p))) {
    throw new Error(`Private/local addresses are not allowed: ${host}`);
  }

  return url;
}

const httpGet: Capability<OriginExecutionContext, Input, Output> = {
  async call(_ectx, { url: raw }) {
    const url = validateUrl(raw);

    const res = await fetch(url, {
      headers: { "User-Agent": "ok.lol/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const buf = await res.arrayBuffer();
    const body = new TextDecoder().decode(buf.slice(0, MAX_BODY));

    return { body, status: res.status };
  },

  description:
    "Fetch a public URL via HTTP GET. Returns the response body (up to 64 KB) and status code. " +
    "Only http:// and https:// URLs are allowed.",
  name: "http_get",

  inputSchema: input,
  outputSchema: output,
};

export default httpGet;
