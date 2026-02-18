import type { Tool } from "ai";
import type { z } from "zod";

/** Minimal identity of a capability, for prompts and directories. */
export type CapabilitySpec = {
  /** What this capability does, for model context. */
  description: string;
  /** Unique identifier. */
  name: string;
};

/**
 * A capability is a callable function backed by some resource
 * (an application binary, an API, etc).
 *
 * Schemas are zod types. Use `z.toJSONSchema()` when you need
 * the JSON Schema representation (e.g. for the wire).
 */
export interface Capability<TExecutionContext, TInput, TOutput> {

  // –
  // Functions
  // –

  /** Returns whether the capability is available. Defaults to `() => true`. */
  available?: () => Promise<boolean>;
  /** Calls the capability with the execution context (if any) and the provided input. */
  call: (...args: TExecutionContext extends void
    ? [input: TInput]
    : [ectx: TExecutionContext, input: TInput]
  ) => Promise<TOutput>;
  /** Sets up the capability. Returns early if already set up. Defaults to no-op. */
  setup?: () => Promise<void>;

  // –
  // Identity
  // –

  /** What this capability does, for model context. */
  description: string;
  /** Unique identifier. */
  name: string;

  // –
  // Schemas
  // –

  /** Zod schema for the input to `call`. */
  inputSchema: z.ZodType<TInput>;
  /** Zod schema for the output of `call`. */
  outputSchema: z.ZodType<TOutput>;
}

// –
// Tool derivation
// –

/**
 * Derive an AI SDK tool and directory entry from a capability.
 *
 * For capabilities that require an execution context, pass it as the
 * second argument. It is captured in the tool's `execute` closure.
 */
export function toTool<TCtx, TInput, TOutput>(
  cap: Capability<TCtx, TInput, TOutput>,
  ...rest: TCtx extends void ? [] : [ectx: TCtx]
) {
  const ectx = rest[0] as TCtx;

  // Cast needed: AI SDK's Tool type uses conditional NeverOptional<>
  // which TypeScript can't resolve across generic type parameters.
  return {
    description: cap.description,
    execute: async (input: TInput) => {
      if (ectx !== undefined) {
        return (cap.call as (ectx: TCtx, input: TInput) => Promise<TOutput>)(ectx, input);
      }
      return (cap.call as (input: TInput) => Promise<TOutput>)(input);
    },
    inputSchema: cap.inputSchema,
    outputSchema: cap.outputSchema,
  } as unknown as Tool<TInput, TOutput>;
}
