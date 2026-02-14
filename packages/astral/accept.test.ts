import { describe, expect, test } from "bun:test";
import { accept } from "./accept";

const echo = {
  call: async (input: unknown) => input,
};

describe("accept", () => {
  test("handles inbound calls via receive", async () => {
    const sent: string[] = [];
    const peer = accept({
      capabilities: { echo },
      send: (data) => sent.push(data),
    });

    peer.receive(JSON.stringify({
      capability: "echo",
      id: "r1",
      input: { x: 1 },
      type: "call",
    }));

    // Handler is async; yield to let it resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(sent).toHaveLength(1);
    const result = JSON.parse(sent[0]!);
    expect(result).toEqual({ id: "r1", output: { x: 1 }, type: "result" });
  });

  test("call sends outbound and resolves on result", async () => {
    const sent: string[] = [];
    const peer = accept({
      capabilities: {},
      send: (data) => sent.push(data),
    });

    const promise = peer.call("remote-cap", { a: 1 });

    // Inspect the outbound call
    expect(sent).toHaveLength(1);
    const outbound = JSON.parse(sent[0]!);
    expect(outbound.type).toBe("call");
    expect(outbound.capability).toBe("remote-cap");

    // Simulate the remote sending a result
    peer.receive(JSON.stringify({
      id: outbound.id,
      output: { b: 2 },
      type: "result",
    }));

    const result = await promise;
    expect(result).toEqual({ b: 2 });
  });

  test("close rejects pending calls", async () => {
    const peer = accept({
      capabilities: {},
      send: () => {},
    });

    const promise = peer.call("anything", {});
    peer.close();

    expect(promise).rejects.toThrow("closed");
  });
});
