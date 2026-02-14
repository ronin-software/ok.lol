import type { Callable } from "./handle";
import { createPeer } from "./peer";

export interface ConnectOptions {
  /** Local capabilities to expose to origin */
  capabilities: Record<string, Callable>;
  /** JWT for authentication (sent as ?token= query parameter) */
  jwt: string;
  /** Called on errors */
  onError?: (error: Error) => void;
  /** Timeout for pending outbound calls in ms (default: 30000) */
  timeout?: number;
  /** Origin WebSocket URL (e.g. "wss://origin-123.fly.dev/astral") */
  url: string;
}

export interface ConnectedPeer {
  /** Call a capability on origin */
  call: (capability: string, input: unknown) => Promise<unknown>;
  /** Close the WebSocket connection */
  close: () => void;
}

/** Connect to origin and establish a bidirectional RPC peer */
export function connect(options: ConnectOptions): Promise<ConnectedPeer> {
  const { capabilities, jwt, onError, timeout, url } = options;

  // Append JWT as query parameter
  const endpoint = new URL(url);
  endpoint.searchParams.set("token", jwt);

  const ws = new WebSocket(endpoint.toString());

  return new Promise<ConnectedPeer>((resolve, reject) => {
    ws.onopen = () => {
      const internal = createPeer({
        capabilities,
        send: (data) => ws.send(data),
        timeout,
      });

      ws.onmessage = (event) => {
        internal.receive(typeof event.data === "string" ? event.data : String(event.data));
      };

      ws.onclose = () => internal.destroy("connection closed");

      ws.onerror = (event) => {
        const error = event instanceof ErrorEvent ? new Error(event.message) : new Error("WebSocket error");
        onError?.(error);
      };

      resolve({
        call: internal.call,
        close: () => ws.close(),
      });
    };

    ws.onerror = (event) => {
      const error = event instanceof ErrorEvent ? new Error(event.message) : new Error("WebSocket connection failed");
      reject(error);
    };
  });
}
