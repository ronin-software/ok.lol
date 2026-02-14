# @ok.lol/astral

A secure HTTP adapter for calling remote capabilities, with SSE streaming.

## Overview

```
Client ——POST——→ Server
       ←—JSON——  (single result)
       ←—SSE———  (streaming result)
```

JWT authenticates every request via the `Authorization` header. Capabilities that return an `AsyncIterable` stream as SSE; all others return JSON.

## Usage

### Server

```typescript
import { serve } from "@ok.lol/astral";

Bun.serve({
  routes: {
    "/astral/*": {
      POST: serve({
        capabilities: { transcription },
        verify: (jwt) => isValid(jwt),
      }),
    },
  },
});
```

### Client

```typescript
import { connect } from "@ok.lol/astral";

const remote = connect({
  url: "https://origin.fly.dev/astral",
  jwt: "ey...",
});

// Single result
const result = await remote.call("transcription", { audio: "..." });

// Streaming — returns AsyncIterable when the capability streams
const stream = await remote.call("generate", { prompt: "..." });
for await (const chunk of stream as AsyncIterable<string>) {
  process.stdout.write(chunk);
}
```

### Standalone dispatch

`handle` creates a dispatcher from a capability record, useful outside of the HTTP lifecycle:

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
| `serve(options)` | Create an HTTP handler that dispatches to capabilities |
| `connect(options)` | Bind a remote endpoint for authenticated calls |
| `handle(capabilities)` | Create a `Call → Yield* → Result` dispatcher |

### Types

- **`Callable`** — `{ call: (input: unknown) => Promise<unknown> }`. Any object with a `call` method, including `Capability`. Streaming callables return `Promise<AsyncIterable<T>>`.
- **`Remote`** — `{ call(name, input) }`. Returned by `connect`; calls remote capabilities over HTTP.
- **`ServeOptions`** — `{ capabilities, verify }`. Passed to `serve`.
- **`ConnectOptions`** — `{ url, jwt }`. Passed to `connect`.

## Security

- **Bearer JWT** — every request is authenticated; invalid tokens get a 401.
- **Implicit allowlist** — `handle` only dispatches to capabilities explicitly registered. No discovery, no dynamic loading.
- **Data-only wire format** — input is JSON. No code, no eval surface.

## Zero dependencies

astral defines a structural `Callable` type rather than importing from other packages. Anything with a `call` method satisfies it.
