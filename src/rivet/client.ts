/**
 * Server-side Rivet client for sending notifications.
 */

import { createClient } from "rivetkit/client";
import type { registry, NotifyPayload } from "./registry";

const endpoint = process.env.RIVET_ENDPOINT
  ?? `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/rivet`;

const client = createClient<typeof registry>({ endpoint });

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
