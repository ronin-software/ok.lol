import { afterEach, describe, expect, test } from "bun:test";
import { connect } from "./connect";
import { serve } from "./serve";

const echo = {
  call: async (input: unknown) => input,
};

const counter = {
  call: async () =>
    (async function* () {
      yield 1;
      yield 2;
      yield 3;
    })(),
};

const boom = {
  call: async () => {
    throw new Error("kaboom");
  },
};

/** Spin up a Bun HTTP server wired to serve() */
function start(
  capabilities: Record<string, { call: (input: unknown) => Promise<unknown> }>,
) {
  const handler = serve({
    capabilities,
    verify: (jwt) => jwt === "valid",
  });

  const server = Bun.serve({
    port: 0,
    routes: {
      "/astral/*": { POST: handler },
    },
  });

  return {
    close: () => server.stop(true),
    url: `http://localhost:${server.port}/astral`,
  };
}

describe("connect + serve", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  test("calls a remote capability", async () => {
    const server = start({ echo });
    cleanup = server.close;

    const remote = connect({ url: server.url, jwt: "valid" });
    const result = await remote.call("echo", { hello: "world" });
    expect(result).toEqual({ hello: "world" });
  });

  test("rejects on invalid JWT", async () => {
    const server = start({ echo });
    cleanup = server.close;

    const remote = connect({ url: server.url, jwt: "bad" });
    expect(remote.call("echo", {})).rejects.toThrow();
  });

  test("rejects on missing JWT", async () => {
    const server = start({ echo });
    cleanup = server.close;

    const remote = connect({ url: server.url, jwt: "" });
    expect(remote.call("echo", {})).rejects.toThrow();
  });

  test("throws for unknown capability", async () => {
    const server = start({ echo });
    cleanup = server.close;

    const remote = connect({ url: server.url, jwt: "valid" });
    expect(remote.call("missing", {})).rejects.toThrow();
  });

  test("returns error message from capability", async () => {
    const server = start({ boom });
    cleanup = server.close;

    const remote = connect({ url: server.url, jwt: "valid" });
    expect(remote.call("boom", {})).rejects.toThrow("kaboom");
  });

  // –
  // Streaming
  // –

  test("streams async iterable via SSE", async () => {
    const server = start({ counter });
    cleanup = server.close;

    const remote = connect({ url: server.url, jwt: "valid" });
    const stream = (await remote.call("counter", {})) as AsyncIterable<number>;

    const chunks: number[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(chunks).toEqual([1, 2, 3]);
  });

  test("streaming error throws on client", async () => {
    const failing = {
      call: async () =>
        (async function* () {
          yield "ok";
          throw new Error("mid-stream");
        })(),
    };

    const server = start({ failing });
    cleanup = server.close;

    const remote = connect({ url: server.url, jwt: "valid" });
    const stream = (await remote.call(
      "failing",
      {},
    )) as AsyncIterable<string>;

    const chunks: string[] = [];
    try {
      for await (const chunk of stream) chunks.push(chunk);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(chunks).toEqual(["ok"]);
      expect((e as Error).message).toBe("mid-stream");
    }
  });
});
