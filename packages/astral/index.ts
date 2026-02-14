export { connect } from "./connect";
export type { ConnectOptions, Remote } from "./connect";
export { handle } from "./handle";
export type { Callable } from "./handle";
export { serve } from "./serve";
export type { ServeOptions } from "./serve";

// –
// Wire format (internal to serve, exposed for standalone handle usage)
// –

/** RPC invocation */
export interface Call {
  /** Target capability name */
  capability: string;
  /** Correlation ID */
  id: string;
  /** JSON-serializable input */
  input: unknown;
  type: "call";
}

/** Intermediate streaming value */
export interface Yield {
  /** Correlation ID */
  id: string;
  /** JSON-serializable output chunk */
  output: unknown;
  type: "yield";
}

/** Terminal result */
export interface Result {
  /** Error message on failure */
  error?: string;
  /** Correlation ID */
  id: string;
  /** JSON-serializable output on success */
  output?: unknown;
  type: "result";
}

/** A wire frame */
export type Message = Call | Result | Yield;
