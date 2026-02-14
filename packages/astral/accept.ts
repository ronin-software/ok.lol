import type { Callable } from "./handle";
import { createPeer } from "./peer";

export interface AcceptOptions {
  /** Local capabilities to expose to the remote peer */
  capabilities: Record<string, Callable>;
  /** Send a string to the remote peer (bound to the WebSocket) */
  send: (data: string) => void;
  /** Timeout for pending outbound calls in ms (default: 30000) */
  timeout?: number;
}

export interface Peer {
  /** Call a capability on the remote peer */
  call: (capability: string, input: unknown) => Promise<unknown>;
  /** Close the peer, rejecting all pending calls */
  close: () => void;
  /** Feed an incoming WebSocket message string */
  receive: (data: string) => void;
}

/** Wrap a server-side WebSocket connection as a bidirectional RPC peer */
export function accept(options: AcceptOptions): Peer {
  const internal = createPeer(options);

  return {
    call: internal.call,
    close: () => internal.destroy("closed"),
    receive: internal.receive,
  };
}
