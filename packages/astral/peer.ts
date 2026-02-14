import type { Channel } from "./channel";
import { channel } from "./channel";
import type { Callable } from "./handle";
import { handle } from "./handle";
import type { Call, Message } from "./index";

const DEFAULT_TIMEOUT = 30_000;

interface PeerOptions {
  /** Local capabilities to expose */
  capabilities: Record<string, Callable>;
  /** Send a serialized Message to the remote side */
  send: (data: string) => void;
  /** Timeout for pending outbound calls in ms (default: 30000) */
  timeout?: number;
}

interface PeerHandle {
  /** Call a capability on the remote peer */
  call: (capability: string, input: unknown) => Promise<unknown>;
  /** Reject all pending calls (used on disconnect) */
  destroy: (reason?: string) => void;
  /** Feed an incoming WebSocket message */
  receive: (data: string) => void;
}

interface Pending {
  reject: (reason: Error) => void;
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Shared bidirectional RPC logic used by accept and connect */
export function createPeer(options: PeerOptions): PeerHandle {
  const { send, timeout = DEFAULT_TIMEOUT } = options;
  const dispatch = handle(options.capabilities);
  const pending = new Map<string, Pending>();
  const streams = new Map<string, Channel<unknown>>();

  function call(capability: string, input: unknown): Promise<unknown> {
    const id = crypto.randomUUID();
    const message: Call = { capability, id, input, type: "call" };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`call ${capability} timed out`));
      }, timeout);

      pending.set(id, { reject, resolve, timer });
      send(JSON.stringify(message));
    });
  }

  function receive(data: string): void {
    let message: Message;
    try {
      message = JSON.parse(data) as Message;
    } catch {
      return; // malformed
    }

    if (message.type === "call") {
      // Dispatch inbound call, streaming each frame to the remote side
      (async () => {
        for await (const msg of dispatch(message)) send(JSON.stringify(msg));
      })();
    } else if (message.type === "yield") {
      // First yield for this ID: promote pending → stream
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        clearTimeout(entry.timer);
        const ch = channel<unknown>();
        streams.set(message.id, ch);
        ch.push(message.output);
        entry.resolve(ch.iterable);
        return;
      }

      // Subsequent yields
      const ch = streams.get(message.id);
      if (ch) ch.push(message.output);
    } else if (message.type === "result") {
      // Stream completion
      const ch = streams.get(message.id);
      if (ch) {
        streams.delete(message.id);
        if (message.error !== undefined) {
          ch.error(new Error(message.error));
        } else {
          ch.close();
        }
        return;
      }

      // Single-result completion
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);

      if (message.error !== undefined) {
        entry.reject(new Error(message.error));
      } else {
        entry.resolve(message.output);
      }
    }
    // unknown type -- silently ignored
  }

  function destroy(reason?: string): void {
    const error = new Error(reason ?? "peer destroyed");
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
      pending.delete(id);
    }
    for (const [id, ch] of streams) {
      ch.error(error);
      streams.delete(id);
    }
  }

  return { call, destroy, receive };
}
