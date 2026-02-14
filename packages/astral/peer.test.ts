import { describe, expect, test } from "bun:test";
import { createPeer } from "./peer";

const echo = {
  call: async (input: unknown) => input,
};

/** Wire two peers together so send goes to the other's receive */
function pair(
  capA: Record<string, { call: (input: unknown) => Promise<unknown> }> = {},
  capB: Record<string, { call: (input: unknown) => Promise<unknown> }> = {},
  timeout?: number,
) {
  const a = createPeer({
    capabilities: capA,
    send: (data) => b.receive(data),
    timeout,
  });
  const b = createPeer({
    capabilities: capB,
    send: (data) => a.receive(data),
    timeout,
  });
  return { a, b };
}

/** Collect all values from an async iterable */
async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe("createPeer", () => {
  test("outbound call resolves when result arrives", async () => {
    const { a } = pair({}, { echo });
    const result = await a.call("echo", { x: 1 });
    expect(result).toEqual({ x: 1 });
  });

  test("inbound call dispatches to local capability", async () => {
    const sent: string[] = [];
    const peer = createPeer({
      capabilities: { echo },
      send: (data) => sent.push(data),
    });

    peer.receive(JSON.stringify({
      capability: "echo",
      id: "inbound-1",
      input: "hello",
      type: "call",
    }));

    await new Promise((r) => setTimeout(r, 10));

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!)).toEqual({
      id: "inbound-1",
      output: "hello",
      type: "result",
    });
  });

  test("unknown capability returns error result", async () => {
    const sent: string[] = [];
    const peer = createPeer({
      capabilities: {},
      send: (data) => sent.push(data),
    });

    peer.receive(JSON.stringify({
      capability: "nope",
      id: "u1",
      input: null,
      type: "call",
    }));

    await new Promise((r) => setTimeout(r, 10));

    const result = JSON.parse(sent[0]!);
    expect(result.error).toBe("unknown capability");
    expect(result.id).toBe("u1");
  });

  test("result with error rejects the pending promise", async () => {
    const sent: string[] = [];
    const peer = createPeer({
      capabilities: {},
      send: (data) => sent.push(data),
    });

    const promise = peer.call("remote", {});
    const outbound = JSON.parse(sent[0]!);

    peer.receive(JSON.stringify({
      error: "not found",
      id: outbound.id,
      type: "result",
    }));

    expect(promise).rejects.toThrow("not found");
  });

  test("destroy rejects all pending calls", async () => {
    const peer = createPeer({
      capabilities: {},
      send: () => {},
    });

    const p1 = peer.call("a", {});
    const p2 = peer.call("b", {});
    peer.destroy("gone");

    expect(p1).rejects.toThrow("gone");
    expect(p2).rejects.toThrow("gone");
  });

  test("destroy with no reason uses default message", async () => {
    const peer = createPeer({
      capabilities: {},
      send: () => {},
    });

    const promise = peer.call("x", {});
    peer.destroy();

    expect(promise).rejects.toThrow("peer destroyed");
  });

  test("timeout rejects pending call", async () => {
    const peer = createPeer({
      capabilities: {},
      send: () => {},
      timeout: 50,
    });

    const promise = peer.call("slow", {});
    expect(promise).rejects.toThrow("call slow timed out");
  });

  test("malformed messages are silently ignored", () => {
    const peer = createPeer({
      capabilities: {},
      send: () => {},
    });

    // Should not throw
    peer.receive("not json");
    peer.receive("{}");
    peer.receive(JSON.stringify({ type: "nonsense" }));
  });

  test("result for unknown id is silently ignored", () => {
    const peer = createPeer({
      capabilities: {},
      send: () => {},
    });

    // No pending call with this id -- should not throw
    peer.receive(JSON.stringify({
      id: "orphan",
      output: 42,
      type: "result",
    }));
  });

  test("bidirectional: both peers call each other", async () => {
    const double = {
      call: async (input: unknown) => ({ n: (input as { n: number }).n * 2 }),
    };

    const { a, b } = pair({ echo }, { double });

    const [fromA, fromB] = await Promise.all([
      a.call("double", { n: 5 }),
      b.call("echo", "ping"),
    ]);

    expect(fromA).toEqual({ n: 10 });
    expect(fromB).toBe("ping");
  });

  // –
  // Streaming
  // –

  test("streaming call resolves to async iterable", async () => {
    const counter = {
      call: async () => (async function* () { yield 1; yield 2; yield 3; })(),
    };

    const { a } = pair({}, { counter });
    const stream = await a.call("counter", {});
    const items = await collect(stream as AsyncIterable<unknown>);
    expect(items).toEqual([1, 2, 3]);
  });

  test("streaming inbound call sends yield frames then result", async () => {
    const sent: string[] = [];
    const counter = {
      call: async () => (async function* () { yield "a"; yield "b"; })(),
    };

    const peer = createPeer({
      capabilities: { counter },
      send: (data) => sent.push(data),
    });

    peer.receive(JSON.stringify({
      capability: "counter",
      id: "s1",
      input: null,
      type: "call",
    }));

    await new Promise((r) => setTimeout(r, 20));

    const frames = sent.map((s) => JSON.parse(s));
    expect(frames).toEqual([
      { id: "s1", output: "a", type: "yield" },
      { id: "s1", output: "b", type: "yield" },
      { id: "s1", type: "result" },
    ]);
  });

  test("streaming error terminates the iterable", async () => {
    const failing = {
      call: async () => (async function* () {
        yield "ok";
        throw new Error("mid-stream");
      })(),
    };

    const { a } = pair({}, { failing });
    const stream = await a.call("failing", {});

    const items: unknown[] = [];
    let caught: Error | undefined;
    try {
      for await (const item of stream as AsyncIterable<unknown>) {
        items.push(item);
      }
    } catch (e) {
      caught = e as Error;
    }

    expect(items).toEqual(["ok"]);
    expect(caught?.message).toBe("mid-stream");
  });

  test("destroy errors active streams", async () => {
    const slow = {
      call: async () => (async function* () {
        yield 1;
        await new Promise((r) => setTimeout(r, 1000));
        yield 2;
      })(),
    };

    const sent: string[] = [];
    const peerA = createPeer({ capabilities: {}, send: (data) => sent.push(data) });
    const peerB = createPeer({
      capabilities: { slow },
      send: (data) => peerA.receive(data),
    });

    // Wire A's outbound to B
    const origSend = peerA;
    const promise = peerA.call("slow", {});
    const outbound = JSON.parse(sent[0]!) as { id: string };
    // Simulate B receiving the call
    peerB.receive(sent[0]!);

    // Wait for first yield to arrive
    await new Promise((r) => setTimeout(r, 20));

    const stream = await promise;

    // Destroy while stream is active
    peerA.destroy("gone");

    let caught: Error | undefined;
    try {
      for await (const _ of stream as AsyncIterable<unknown>) {
        // drain
      }
    } catch (e) {
      caught = e as Error;
    }

    expect(caught?.message).toBe("gone");
  });

  test("yield for unknown id is silently ignored", () => {
    const peer = createPeer({
      capabilities: {},
      send: () => {},
    });

    // No pending call or stream with this id
    peer.receive(JSON.stringify({
      id: "orphan",
      output: 42,
      type: "yield",
    }));
  });
});
