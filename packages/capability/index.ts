import type { JSONSchema7 } from "@ok.lol/jsonschema";
import type { z } from "zod";

/**
 * A capability is a callable function backed by some resource (an application binary, an API, etc).
 */
export interface Capability<TInput, TOutput> {

  // –
  // Functions
  // –

  /** Returns whether the capability is available */
  available: () => Promise<boolean>;
  /** Calls the capability with the provided input */
  call: (input: TInput) => Promise<TOutput>;
  /** Sets up the capability. Returns early if already setup. Throws on failure */
  setup: () => Promise<void>;

  // –
  // Identity
  // –

  /** Unique identifier */
  name: string;
  /** What this capability does, for model context */
  description: string;

  // –
  // Schemas
  // –

  /** JSON Schema for the input to `call` */
  inputSchema: JSONSchema7;
  /** JSON Schema for the output of `call` */
  outputSchema: JSONSchema7;
}

/** Convert a Zod schema to JSONSchema7, targeting draft-07 */
export function zodToJsonSchema(schema: z.ZodType): JSONSchema7 {
  return schema.toJSONSchema({ target: "draft-07" }) as JSONSchema7;
}