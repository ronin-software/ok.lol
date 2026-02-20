/**
 * Rivet actor registry — real-time notification relay.
 *
 * The `inbox` actor is keyed by principal ID. Clients connect via
 * WebSocket to receive push notifications. When no clients are
 * connected, the server falls back to email.
 *
 * Default driver — local filesystem in dev, Rivet Cloud in production.
 */

import { actor, setup } from "rivetkit";

/** Notification payload broadcast to connected clients. */
export type NotifyPayload = {
  /** Preview of the message content. */
  content: string;
  /** Thread the message belongs to. */
  threadId: string;
  /** Thread title for display. */
  title: string;
};

export const inbox = actor({
  state: {},
  actions: {
    /**
     * Broadcast a notification to all connected clients.
     * Returns true if at least one client received it.
     */
    notify: (c, payload: NotifyPayload): boolean => {
      if (c.conns.size > 0) {
        c.broadcast("message", payload);
        return true;
      }
      return false;
    },
  },
});

export const registry = setup({
  use: { inbox },
});
