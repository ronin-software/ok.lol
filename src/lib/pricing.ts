/**
 * Unit cost registry for payable resources.
 *
 * Each key identifies a billable resource (model tokens, API calls, etc.).
 * Cost per usage row is `amount * unitCost`, computed at write time so
 * the rate at time of use is locked in.
 */

/** Unit cost per resource in micro-USD */
export const unitCosts: Record<string, bigint> = {
  "claude-sonnet-4-5-20250929:input": 3n,
  "claude-sonnet-4-5-20250929:output": 15n,
  "resend:send": 1000n,
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
