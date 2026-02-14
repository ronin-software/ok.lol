# @ok.lol/astral

A secure bidirectional RPC protocol backed by secure Websockets and authenticated by JWT.

Both peers expose capabilities and can invoke the other's over a single connection.

This allows bots to "astral project" their intents to be executed across machines.

## Overview

```
Worker ←——WebSocket——→ Principal

  Worker calls principal capabilities
  Principal calls worker capabilities
```

astral is transport-agnostic on the server side — you provide `send` and feed it `receive`. On the client side, it manages a `WebSocket` directly. JWT authenticates the connection at upgrade time.

## Usage

### Principal

```typescript
import { accept } from "@ok.lol/astral";

Bun.serve({
  fetch(req, server) {
    const url = new URL(req.url);
    const jwt = url.searchParams.get("token");
    if (!jwt || !verify(jwt)) return new Response("Unauthorized", { status: 401 });
    server.upgrade(req);
  },
  websocket: {
    open(ws) {
      ws.data.peer = accept({
        capabilities: { transcription },
        send: (data) => ws.send(data),
      });
    },
    message(ws, msg) {
      ws.data.peer.receive(String(msg));
    },
    close(ws) {
      ws.data.peer.close();
    },
  },
});
```

### Worker

```typescript
import { connect } from "@ok.lol/astral";

const peer = await connect({
  capabilities: { bash },
  jwt: "ey...",
  url: "wss://origin.fly.dev/astral",
});

// Single result
const result = await peer.call("transcription", { audio: "..." });

// Streaming — call resolves to an AsyncIterable when the capability streams
const stream = await peer.call("generate", { prompt: "..." });
for await (const chunk of stream as AsyncIterable<string>) {
  process.stdout.write(chunk);
}

peer.close();
```

### Standalone dispatch

`handle` creates a dispatcher from a capability record, useful outside of the peer lifecycle:

```typescript
import { handle } from "@ok.lol/astral";

const dispatch = handle({ echo, bash });
for await (const msg of dispatch({ capability: "echo", id: "1", input: "hi", type: "call" })) {
  // single-result calls yield one Result; streaming calls yield Yields then a Result
}
```

## API

| Export | Description |
|---|---|
| `accept(options)` | Wrap a server-side WebSocket as a `Peer` |
| `connect(options)` | Open a client WebSocket, return a `ConnectedPeer` |
| `handle(capabilities)` | Create a `Call → Yield* → Result` dispatcher |

### Types

- **`Callable`** — `{ call: (input: unknown) => Promise<unknown> }`. Any object with a `call` method, including `Capability`. Streaming callables return `Promise<AsyncIterable<T>>`.
- **`Peer`** — `{ call, close, receive }`. Server-side peer; you wire `receive` to your WebSocket message handler.
- **`ConnectedPeer`** — `{ call, close }`. Client-side peer; receive is wired internally.
- **`Call`** — `{ type: "call", id, capability, input }`.
- **`Yield`** — `{ type: "yield", id, output }`. Intermediate streaming value.
- **`Result`** — `{ type: "result", id, output?, error? }`. Terminal frame.
- **`Message`** — `Call | Yield | Result`.

## Security

- **JWT on upgrade** — invalid tokens never get a connection.
- **Implicit allowlist** — `handle` only dispatches to capabilities explicitly registered. No discovery, no dynamic loading.
- **Data-only wire format** — `Call.input` is JSON. No code, no eval surface.

## Zero dependencies

astral defines a structural `Callable` type rather than importing from other packages. Anything with a `call` method satisfies it.
