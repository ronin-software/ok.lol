import { describe, expect, test } from "bun:test";
import { handle } from "./handle";
import type { Call, Result, Yield } from ".";

const echo = {
  call: async (input: unknown) => input,
};

const boom = {
  call: async () => {
    throw new Error("kaboom");
  },
};

function call(capability: string, input: unknown = {}): Call {
  return { capability, id: "1", input, type: "call" };
}

/** Collect all frames from a dispatch */
async function collect(gen: AsyncGenerator<Yield | Result>) {
  const frames: (Yield | Result)[] = [];
  for await (const msg of gen) frames.push(msg);
  return frames;
}

/** Collect and return the single Result (asserts exactly one frame) */
async function single(gen: AsyncGenerator<Yield | Result>) {
  const frames = await collect(gen);
  expect(frames).toHaveLength(1);
  return frames[0] as Result;
}

describe("handle", () => {
  test("dispatches to a registered callable", async () => {
    const dispatch = handle({ echo });
    const result = await single(dispatch(call("echo", { msg: "hi" })));
    expect(result).toEqual({ id: "1", output: { msg: "hi" }, type: "result" });
  });

  test("returns error for unknown capability", async () => {
    const dispatch = handle({ echo });
    const result = await single(dispatch(call("missing")));
    expect(result).toEqual({ error: "unknown capability", id: "1", type: "result" });
  });

  test("catches thrown errors", async () => {
    const dispatch = handle({ boom });
    const result = await single(dispatch(call("boom")));
    expect(result).toEqual({ error: "kaboom", id: "1", type: "result" });
  });

  test("preserves correlation id", async () => {
    const dispatch = handle({ echo });
    const result = await single(dispatch({ capability: "echo", id: "abc-123", input: null, type: "call" }));
    expect(result.id).toBe("abc-123");
  });

  test("catches non-Error throws", async () => {
    const rude = { call: async () => { throw "string error"; } };
    const dispatch = handle({ rude });
    const result = await single(dispatch(call("rude")));
    expect(result).toEqual({ error: "string error", id: "1", type: "result" });
  });

  // –
  // Implicit allowlist
  // –

  test("__proto__ is not a valid capability", async () => {
    const dispatch = handle({ echo });
    const result = await single(dispatch(call("__proto__")));
    expect(result.error).toBe("unknown capability");
  });

  test("constructor is not a valid capability", async () => {
    const dispatch = handle({ echo });
    const result = await single(dispatch(call("constructor")));
    expect(result.error).toBe("unknown capability");
  });

  test("toString is not a valid capability", async () => {
    const dispatch = handle({ echo });
    const result = await single(dispatch(call("toString")));
    expect(result.error).toBe("unknown capability");
  });

  // –
  // Streaming
  // –

  test("streams async iterable as yield frames", async () => {
    const counter = {
      call: async () => (async function* () { yield 1; yield 2; yield 3; })(),
    };
    const dispatch = handle({ counter });
    const frames = await collect(dispatch(call("counter")));

    expect(frames).toEqual([
      { id: "1", output: 1, type: "yield" },
      { id: "1", output: 2, type: "yield" },
      { id: "1", output: 3, type: "yield" },
      { id: "1", type: "result" },
    ]);
  });

  test("streaming error yields result with error", async () => {
    const failing = {
      call: async () => (async function* () {
        yield "ok";
        throw new Error("mid-stream");
      })(),
    };
    const dispatch = handle({ failing });
    const frames = await collect(dispatch(call("failing")));

    expect(frames).toEqual([
      { id: "1", output: "ok", type: "yield" },
      { error: "mid-stream", id: "1", type: "result" },
    ]);
  });

  test("empty async iterable yields only terminal result", async () => {
    const empty = {
      call: async () => (async function* () {})(),
    };
    const dispatch = handle({ empty });
    const frames = await collect(dispatch(call("empty")));

    expect(frames).toEqual([
      { id: "1", type: "result" },
    ]);
  });
});
