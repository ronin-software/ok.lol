import type { Call, Result, Yield } from ".";

/** Anything with a call method -- Capability satisfies this structurally */
export interface Callable {
  /** Invoke with JSON input, return JSON output */
  call: (input: unknown) => Promise<unknown>;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value != null && typeof value === "object" && Symbol.asyncIterator in value;
}

/** Create a handler that dispatches calls to registered callables */
export function handle(
  capabilities: Record<string, Callable>,
): (call: Call) => AsyncGenerator<Yield | Result> {
  return async function* (call) {
    // Own-property check prevents prototype pollution (__proto__, constructor, etc.)
    if (!Object.hasOwn(capabilities, call.capability)) {
      yield { error: "unknown capability", id: call.id, type: "result" };
      return;
    }

    const capability = capabilities[call.capability]!;
    try {
      const output = await capability.call(call.input);

      if (isAsyncIterable(output)) {
        for await (const item of output) {
          yield { id: call.id, output: item, type: "yield" };
        }
        yield { id: call.id, type: "result" };
      } else {
        yield { id: call.id, output, type: "result" };
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      yield { error, id: call.id, type: "result" };
    }
  };
}
