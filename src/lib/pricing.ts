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
