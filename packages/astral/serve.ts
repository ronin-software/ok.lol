import type { Callable } from "./handle";
import { handle } from "./handle";

export interface ServeOptions {
  /** Capabilities to expose over HTTP */
  capabilities: Record<string, Callable>;
  /** Return true if the JWT is valid */
  verify: (jwt: string) => boolean | Promise<boolean>;
}

/** Create an HTTP POST handler that dispatches to capabilities, streaming via SSE */
export function serve(
  options: ServeOptions,
): (req: Request) => Response | Promise<Response> {
  const { capabilities, verify } = options;
  const dispatch = handle(capabilities);

  return async (req) => {
    // Auth
    const header = req.headers.get("authorization");
    const jwt = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!jwt || !(await verify(jwt))) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Capability name from last path segment
    const name = new URL(req.url).pathname.split("/").filter(Boolean).pop();
    if (!name || !Object.hasOwn(capabilities, name)) {
      return new Response("Not Found", { status: 404 });
    }

    // Input
    const input = await req.json().catch(() => undefined);

    // Dispatch
    const frames = dispatch({
      capability: name,
      id: crypto.randomUUID(),
      input,
      type: "call",
    });

    const first = await frames.next();
    if (first.done) return new Response(null, { status: 204 });

    const frame = first.value;

    // Single result
    if (frame.type === "result") {
      if (frame.error) {
        return Response.json({ error: frame.error }, { status: 500 });
      }
      return Response.json(frame.output);
    }

    // Streaming — first frame is a yield, send as SSE
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(frame.output)}\n\n`),
          );

          for await (const f of frames) {
            if (f.type === "yield") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(f.output)}\n\n`),
              );
            } else if (f.type === "result" && f.error) {
              controller.enqueue(
                encoder.encode(
                  `event: error\ndata: ${JSON.stringify(f.error)}\n\n`,
                ),
              );
            }
          }

          controller.close();
        },
      }),
      {
        headers: {
          "Cache-Control": "no-cache",
          "Content-Type": "text/event-stream",
        },
      },
    );
  };
}
