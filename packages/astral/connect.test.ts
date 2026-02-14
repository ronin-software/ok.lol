import { afterEach, describe, expect, test } from "bun:test";
import { connect } from "./connect";
import { accept } from "./accept";
import type { Peer } from "./accept";

const echo = {
  call: async (input: unknown) => input,
};

const double = {
  call: async (input: unknown) => {
    const n = (input as { n: number }).n;
    return { result: n * 2 };
  },
};

/** Spin up a Bun WebSocket server wired to accept() */
function serve(capabilities: Record<string, { call: (input: unknown) => Promise<unknown> }>) {
  const peers: Peer[] = [];

  const server = Bun.serve({
    port: 0,
    fetch(req, server) {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (token !== "valid") return new Response("Unauthorized", { status: 401 });
      server.upgrade(req);
      return undefined;
    },
    websocket: {
      open(ws) {
        const peer = accept({
          capabilities,
          send: (data) => ws.send(data),
        });
        peers.push(peer);
        (ws as unknown as { peer: Peer }).peer = peer;
      },
      message(ws, msg) {
        (ws as unknown as { peer: Peer }).peer.receive(
          typeof msg === "string" ? msg : new TextDecoder().decode(msg),
        );
      },
      close(ws) {
        (ws as unknown as { peer: Peer }).peer.close();
      },
    },
  });

  return {
    close: () => {
      peers.forEach((p) => p.close());
      server.stop(true);
    },
    url: `ws://localhost:${server.port}`,
  };
}

describe("connect", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  test("establishes connection and calls remote capability", async () => {
    const server = serve({ echo });
    cleanup = server.close;

    const peer = await connect({
      capabilities: {},
      jwt: "valid",
      url: server.url,
    });

    const result = await peer.call("echo", { hello: "world" });
    expect(result).toEqual({ hello: "world" });
    peer.close();
  });

  test("rejects on invalid JWT", async () => {
    const server = serve({ echo });
    cleanup = server.close;

    expect(
      connect({
        capabilities: {},
        jwt: "bad",
        url: server.url,
      }),
    ).rejects.toThrow();
  });

  test("rejects on empty JWT", async () => {
    const server = serve({ echo });
    cleanup = server.close;

    expect(
      connect({
        capabilities: {},
        jwt: "",
        url: server.url,
      }),
    ).rejects.toThrow();
  });

  test("unregistered capability returns error over live connection", async () => {
    const server = serve({ echo });
    cleanup = server.close;

    const peer = await connect({
      capabilities: {},
      jwt: "valid",
      url: server.url,
    });

    expect(peer.call("bash", { command: "rm -rf /" })).rejects.toThrow("unknown capability");
    peer.close();
  });

  test("bidirectional RPC: origin calls worker capability", async () => {
    // Server has echo, will call worker's double
    const peers: Peer[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(req, server) {
        server.upgrade(req);
        return undefined;
      },
      websocket: {
        open(ws) {
          const peer = accept({
            capabilities: {},
            send: (data) => ws.send(data),
          });
          peers.push(peer);
          (ws as unknown as { peer: Peer }).peer = peer;
        },
        message(ws, msg) {
          (ws as unknown as { peer: Peer }).peer.receive(
            typeof msg === "string" ? msg : new TextDecoder().decode(msg),
          );
        },
        close(ws) {
          (ws as unknown as { peer: Peer }).peer.close();
        },
      },
    });

    cleanup = () => {
      peers.forEach((p) => p.close());
      server.stop(true);
    };

    // Worker connects, exposing "double"
    const workerPeer = await connect({
      capabilities: { double },
      jwt: "any",
      url: `ws://localhost:${server.port}`,
    });

    // Wait for server peer to be created
    await new Promise((r) => setTimeout(r, 50));

    // Origin calls "double" on the worker
    const result = await peers[0]?.call("double", { n: 21 });
    expect(result).toEqual({ result: 42 });

    workerPeer.close();
  });
});
