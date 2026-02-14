export interface ConnectOptions {
  /** JWT for authentication (sent as Bearer token) */
  jwt: string;
  /** Base URL for the capability endpoint (e.g. "https://origin.fly.dev/astral") */
  url: string;
}

export interface Remote {
  /** Call a remote capability by name */
  call: (capability: string, input: unknown) => Promise<unknown>;
}

/** Bind a remote capability endpoint for authenticated calls */
export function connect(options: ConnectOptions): Remote {
  const { jwt, url } = options;

  return {
    async call(capability, input) {
      const res = await fetch(`${url}/${capability}`, {
        body: JSON.stringify(input),
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
          error?: string;
        };
        throw new Error(body.error ?? res.statusText);
      }

      // SSE stream → async iterable
      if (res.headers.get("content-type")?.includes("text/event-stream")) {
        return parseSSE(res.body!);
      }

      // Single JSON result
      return res.json();
    },
  };
}

// –
// SSE parsing
// –

/** Parse an SSE byte stream into an async iterable of JSON values */
async function* parseSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = (body as ReadableStream<BufferSource>)
    .pipeThrough(new TextDecoderStream())
    .getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const parts = buffer.split("\n\n");
      buffer = parts.pop()!; // incomplete trailing fragment

      for (const part of parts) {
        if (!part.trim()) continue;

        let data = "";
        let event = "message";

        for (const line of part.split("\n")) {
          if (line.startsWith("data: ")) data = line.slice(6);
          else if (line.startsWith("event: ")) event = line.slice(7);
        }

        if (event === "error") throw new Error(JSON.parse(data));
        if (data) yield JSON.parse(data);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
