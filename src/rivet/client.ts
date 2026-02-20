/**
 * Server-side Rivet client for sending notifications.
 * Endpoint is read from RIVET_ENDPOINT env var by rivetkit.
 */

import { createClient } from "rivetkit/client";
import type { registry } from "./registry";
import type { NotifyPayload } from "./registry";

const client = createClient<typeof registry>();

/**
 * Send a notification to a principal's inbox actor.
 * Returns true if at least one client received it.
 */
export async function notifyPrincipal(
  principalId: string,
  payload: NotifyPayload,
): Promise<boolean> {
  try {
    const actor = await client.inbox.getOrCreate([principalId]);
    return await actor.notify(payload);
  } catch (err) {
    console.error("[rivet] notify failed:", err);
    return false;
  }
}
