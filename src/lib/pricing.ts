/**
 * Unit cost registry for payable resources.
 *
 * Model inference costs are reported by the AI Gateway at call time,
 * so only non-gateway resources need entries here.
 */

/** Unit cost per resource in micro-USD. */
export const unitCosts: Record<string, bigint> = {
  "resend:send": 900n, // $0.0009 per email sent
};

/** Returns the unit cost for a resource key. Throws if unknown. */
export function unitCost(resource: string): bigint {
  const cost = unitCosts[resource];
  if (cost === undefined) {
    throw new Error(`Unknown resource: ${resource}`);
  }
  return cost;
}

/** Computes cost in micro-USD for a given resource and amount. */
export function computeCost(resource: string, amount: bigint): bigint {
  return amount * unitCost(resource);
}

// –
// Tunnel egress
// –

/**
 * Fly region → base egress rate in micro-USD per byte.
 *
 * $0.02/GB → 0.00002  (NA, EU)
 * $0.04/GB → 0.00004  (APAC, Oceania, SA)
 * $0.12/GB → 0.00012  (Africa, India)
 */
const TUNNEL_REGION_RATE: Record<string, number> = {
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

const TUNNEL_DEFAULT_RATE = 0.00002;
const TUNNEL_PLATFORM_FEE = 1.05;

/** Effective tunnel egress rate (micro-USD/byte) for a Fly region, including platform fee. */
export function tunnelRate(region: string | null): number {
  const base = (region ? TUNNEL_REGION_RATE[region] : undefined) ?? TUNNEL_DEFAULT_RATE;
  return base * TUNNEL_PLATFORM_FEE;
}
