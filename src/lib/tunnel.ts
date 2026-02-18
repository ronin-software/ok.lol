/**
 * Shared tunnel utilities for communicating with worker endpoints
 * through the SSH relay (sish/Caddy).
 *
 * Used by both the act agent loop (capability discovery) and the
 * dashboard (worker probing).
 */

/** Shared secret for the tunnel relay's request gate. */
const TUNNEL_KEY = process.env.TUNNEL_KEY ?? "";

/** Timeout for probing a worker's directory endpoint. */
export const PROBE_TIMEOUT_MS = 3_000;

/** Headers for requests routed through the tunnel relay. */
export function tunnelHeaders(): Record<string, string> {
  if (!TUNNEL_KEY) return {};
  return { "X-Tunnel-Key": TUNNEL_KEY };
}

/** Directory response shape from a worker's GET /. */
type ProbeResult = {
  capabilities?: unknown[];
  name?: string;
};

/**
 * Probe a worker URL and return its directory response.
 * Returns null if the worker is offline or unreachable.
 */
export async function probe(url: string): Promise<ProbeResult | null> {
  try {
    const res = await fetch(url, {
      headers: tunnelHeaders(),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as ProbeResult;
  } catch {
    return null;
  }
}
