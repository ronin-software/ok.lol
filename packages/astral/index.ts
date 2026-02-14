export { accept } from "./accept";
export type { AcceptOptions, Peer } from "./accept";
export { connect } from "./connect";
export type { ConnectedPeer, ConnectOptions } from "./connect";
export { handle } from "./handle";
export type { Callable } from "./handle";

// –
// Wire format
// –

/** RPC invocation sent to the remote peer */
export interface Call {
  type: "call";
  /** Target capability name */
  capability: string;
  /** Correlation ID */
  id: string;
  /** JSON-serializable input */
  input: unknown;
}

/** Intermediate streaming value for a call */
export interface Yield {
  type: "yield";
  /** Correlation ID */
  id: string;
  /** JSON-serializable output chunk */
  output: unknown;
}

/** Terminal result sent back to the caller */
export interface Result {
  type: "result";
  /** Error message on failure */
  error?: string;
  /** Correlation ID */
  id: string;
  /** JSON-serializable output on success */
  output?: unknown;
}

/** A WebSocket frame */
export type Message = Call | Yield | Result;
