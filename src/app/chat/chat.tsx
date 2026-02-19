"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  getToolName,
  isToolUIPart,
  type ToolUIPart,
} from "ai";
import { useCallback, useEffect, useRef, useState } from "react";

// –
// Notification sound
// –

let audioCtx: AudioContext | null = null;

/** Two-note ascending chime (D5 → A5) via Web Audio. */
function playPing() {
  audioCtx ??= new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  const t = audioCtx.currentTime;
  for (const [freq, offset] of [[587, 0], [880, 0.08]] as const) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, t + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.15);
    osc.start(t + offset);
    osc.stop(t + offset + 0.15);
  }
}

type Thread = {
  channel: string;
  createdAt: string;
  id: string;
  snippet: string | null;
  snippetAt: string | null;
  title: string | null;
};

type StoredMessage = {
  content: string;
  id: string;
  parts: unknown[] | null;
  role: string;
};

type Props = {
  /** Pre-hydrated messages for the latest thread (server-loaded). */
  initialMessages?: StoredMessage[];
  /** ID of the thread to show on first render (server-loaded). */
  initialThreadId?: string;
  /** Thread list to show on first render (server-loaded). */
  initialThreads?: Thread[];
};

export default function Chat({ initialMessages = [], initialThreadId, initialThreads = [] }: Props) {
  const [threadId, setThreadId] = useState<string | null>(initialThreadId ?? null);
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const threadIdRef = useRef<string | null>(null);
  // Ref-backed so the stable transport closure can call the latest handlers.
  const onThreadIdRef = useRef<(id: string) => void>(() => {});

  // Keep refs in sync so transport closures always read the latest values.
  useEffect(() => { threadIdRef.current = threadId; }, [threadId]);

  // Transport injects threadId into every request body, and captures the
  // X-Thread-Id header so a newly-created thread is tracked immediately.
  const [transport] = useState(() =>
    new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages, body }) => ({
        body: { ...body, messages, threadId: threadIdRef.current },
      }),
      fetch: (async (url, init) => {
        const res = await globalThis.fetch(url, init);
        const newId = res.headers.get("X-Thread-Id");
        if (newId && newId !== threadIdRef.current) {
          onThreadIdRef.current(newId);
        }
        return res;
      }) as typeof fetch,
    }),
  );

  const { error, messages, sendMessage, setMessages, status } = useChat({
    messages: initialThreadId ? hydrate(initialMessages) as UIMessage[] : undefined,
    transport,
  });

  // When the server assigns a new thread ID, capture it and refresh the list.
  onThreadIdRef.current = (id: string) => {
    setThreadId(id);
    loadThreads();
  };

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevStatusRef = useRef(status);
  const streaming = status === "streaming";

  // Ping when a streamed response finishes.
  useEffect(() => {
    if (prevStatusRef.current === "streaming" && status === "ready") {
      playPing();
    }
    prevStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load thread list and auto-resume the latest on mount — only when the
  // server didn't pre-populate data (e.g. new user with no threads yet).
  useEffect(() => {
    if (initialThreadId) return;
    loadThreads().then((list) => {
      if (list.length > 0) loadThread(list[0]!.id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadThreads(): Promise<Thread[]> {
    const res = await fetch("/api/threads?channel=chat");
    if (!res.ok) return [];
    const list: Thread[] = await res.json();
    setThreads(list);
    return list;
  }

  const loadThread = useCallback(async (id: string) => {
    setThreadId(id);
    const res = await fetch(`/api/threads/${id}`);
    if (!res.ok) {
      setMessages([]);
      return;
    }
    const stored: StoredMessage[] = await res.json();
    setMessages(hydrate(stored) as UIMessage[]);
    setDrawerOpen(false);
  }, [setMessages]);

  // Re-fetch when idle so async agent messages (e.g. email follow-ups) appear.
  useEffect(() => {
    if (status !== "ready" || !threadId) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/threads/${threadId}`);
      if (!res.ok) return;
      const stored: StoredMessage[] = await res.json();
      const next = hydrate(stored);
      if (next.length > messages.length) {
        setMessages(next as UIMessage[]);
        playPing();
      }
    }, 5_000);
    return () => clearInterval(id);
  }, [status, threadId, messages.length, setMessages]);

  function newThread() {
    setThreadId(null);
    setMessages([]);
    setDrawerOpen(false);
    inputRef.current?.focus();
  }

  async function removeThread(id: string) {
    await fetch(`/api/threads/${id}`, { method: "DELETE" });
    // Clear active thread if it was deleted.
    if (threadId === id) {
      setThreadId(null);
      setMessages([]);
    }
    loadThreads();
  }

  function send() {
    const text = input.trim();
    if (text.length === 0 || streaming) return;
    setInput("");
    sendMessage({ text });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="relative flex h-full overflow-hidden bg-background">
      {/* Scrim — taps outside to close drawer; hidden on wide viewports */}
      {drawerOpen && (
        <div
          className="absolute inset-0 z-10 bg-black/60 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Sidebar — always rendered; overlay on narrow, inline on wide */}
      <div className={[
        "flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950",
        drawerOpen
          ? "absolute inset-y-0 left-0 z-20 lg:relative lg:inset-auto lg:z-auto"
          : "hidden lg:flex",
      ].join(" ")}>
          <div className="flex h-12 items-center justify-between border-b border-zinc-800 px-4">
            <span className="text-xs font-medium text-zinc-400">Threads</span>
            <button
              type="button"
              onClick={newThread}
              className="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              + New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {threads.map((t) => (
              <div
                key={t.id}
                className={[
                  "flex items-stretch transition-colors",
                  t.id === threadId
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => loadThread(t.id)}
                  className="min-w-0 flex-1 px-3 py-2 text-left"
                >
                  <div className="truncate text-xs font-medium">
                    {t.title || "Untitled"}
                  </div>
                  {t.snippet && (
                    <div className="mt-0.5 truncate text-[11px] text-zinc-600">
                      {t.snippet}
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => removeThread(t.id)}
                  className="shrink-0 self-center px-2 text-sm text-zinc-700 transition-colors hover:text-red-400"
                  aria-label="Delete thread"
                >
                  ×
                </button>
              </div>
            ))}
            {threads.length === 0 && (
              <p className="px-3 py-4 text-xs text-zinc-600">No threads yet</p>
            )}
          </div>
        </div>

      {/* Main chat area — relative so the composer can float above the scroll */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => { setDrawerOpen(!drawerOpen); if (!drawerOpen) loadThreads(); }}
              className="text-xs text-zinc-500 transition-colors hover:text-white lg:hidden"
            >
              {drawerOpen ? "Close" : "Threads"}
            </button>
            <span className="text-xs font-medium text-zinc-400">Chat</span>
          </div>
          <h1 className="min-w-0 flex-1 truncate px-4 text-center text-sm font-medium">
            {threads.find((t) => t.id === threadId)?.title || "Chat"}
          </h1>
          <div className="shrink-0 w-16" />
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-2xl space-y-6 px-4 pt-6 pb-16">
            {messages.length === 0 && (
              <p className="pt-24 text-center text-sm text-zinc-500">
                Send a message to start chatting with your pal.
              </p>
            )}

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {error && (
              <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
                {error.message}
              </div>
            )}
          </div>
        </div>

        {/* Input — floats over scroll content */}
        <div className="absolute inset-x-0 bottom-0 px-4 py-3">
          <div className="mx-auto w-full max-w-2xl">
            <div className={[
              "flex items-baseline gap-2 rounded-xl border p-1",
              "bg-zinc-900/70 backdrop-blur-md",
              "border-zinc-700/60",
              "shadow-[0_0_24px_-4px_rgba(255,255,255,0.06)]",
              "transition-shadow focus-within:shadow-[0_0_32px_-4px_rgba(255,255,255,0.12)]",
            ].join(" ")}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message your pal..."
                rows={1}
                className={[
                  "flex-1 resize-none bg-transparent px-1 py-0.5 text-sm text-white",
                  "placeholder-zinc-600 outline-none",
                  "max-h-32 overflow-y-auto",
                ].join(" ")}
                style={{ fieldSizing: "content" } as React.CSSProperties}
              />
              <button
                type="button"
                onClick={send}
                disabled={streaming || input.trim().length === 0}
                className={[
                  "shrink-0 rounded-lg bg-white px-3 py-1.5",
                  "text-sm font-medium text-black transition-colors",
                  "hover:bg-zinc-200 disabled:opacity-40",
                ].join(" ")}
              >
                {streaming ? "..." : "Send"}
              </button>
            </div>
          </div>
          <div className="h-[env(safe-area-inset-bottom)]" />
        </div>
      </div>
    </div>
  );
}

// –
// Hydration
// –

type UIMessage = ReturnType<typeof useChat>["messages"][number];

/** Convert stored messages into the shape useChat expects. */
function hydrate(stored: StoredMessage[]) {
  return stored
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      parts: (m.parts ?? [{ type: "text" as const, text: m.content }]) as UIMessage["parts"],
      role: m.role as "user" | "assistant",
    }));
}

// –
// Message
// –
type ToolPart = DynamicToolUIPart | ToolUIPart;

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  const textParts: Array<{ i: number; text: string }> = [];
  const toolParts: Array<{ i: number; part: ToolPart }> = [];
  for (let i = 0; i < message.parts.length; i++) {
    const part = message.parts[i]!;
    if (part.type === "text" && part.text.length > 0) {
      textParts.push({ i, text: part.text });
    } else if (isToolUIPart(part)) {
      toolParts.push({ i, part });
    }
  }

  const hasText = textParts.length > 0;
  const hasTools = toolParts.length > 0;

  if (!hasText && !hasTools) return null;

  return (
    <div className={isUser ? "flex justify-end" : ""}>
      {hasText && (
        <div
          className={[
            "min-w-0 max-w-[85%] wrap-break-word rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-white text-black"
              : "bg-zinc-900 text-zinc-200",
          ].join(" ")}
        >
          {textParts.map(({ i, text }) => (
            <span key={i} className="whitespace-pre-wrap">{text}</span>
          ))}
        </div>
      )}

      {hasTools && (
        <div className="min-w-0 max-w-[85%] space-y-1">
          {toolParts.map(({ i, part }) => (
            <ToolChip key={i} part={part} />
          ))}
        </div>
      )}
    </div>
  );
}

// –
// Tool calls
// –

const toolLabels: Record<string, { active: string; done: string }> = {
  contact_list:    { active: "Listing contacts",    done: "Listed contacts" },
  contact_lookup:  { active: "Looking up contact",  done: "Looked up contact" },
  contact_record:  { active: "Recording contact",   done: "Recorded contact" },
  contact_search:  { active: "Searching contacts",  done: "Searched contacts" },
  document_list:   { active: "Listing documents",   done: "Listed documents" },
  document_read:   { active: "Reading document",    done: "Read document" },
  document_write:  { active: "Writing document",    done: "Wrote document" },
  email_send:      { active: "Sending email",       done: "Sent email" },
  follow_up:       { active: "Following up",        done: "Followed up" },
  http_get:        { active: "Fetching URL",        done: "Fetched URL" },
  contact_lookup_owner:    { active: "Looking up owner",    done: "Looked up owner" },
  thread_summary_expand:   { active: "Expanding summary",   done: "Expanded summary" },
  thread_list:     { active: "Listing threads",     done: "Listed threads" },
  thread_read:     { active: "Reading thread",      done: "Read thread" },
  thread_search:   { active: "Searching threads",   done: "Searched threads" },
};

function ToolChip({ part }: { part: ToolPart }) {
  const name = getToolName(part);
  const done = part.state === "output-available";
  const errored = part.state === "output-error";
  const labels = toolLabels[name];
  const label = errored
    ? `${labels?.active ?? name} failed`
    : done
      ? labels?.done ?? name
      : `${labels?.active ?? name}…`;

  return (
    <div className={[
      "my-2 rounded-lg border px-3 py-2 transition-colors",
      errored
        ? "border-red-800/50 bg-red-950/20"
        : done
          ? "border-zinc-800 bg-zinc-950"
          : "border-amber-800/50 bg-amber-950/20",
    ].join(" ")}>
      <div className="flex items-center gap-2">
        <span className={[
          "inline-block h-2 w-2 shrink-0 rounded-full",
          errored
            ? "bg-red-500"
            : done
              ? "bg-green-500"
              : "bg-amber-400 animate-pulse",
        ].join(" ")} />
        <span className="text-xs text-zinc-300">{label}</span>
      </div>

      {!done && !errored && "input" in part && part.input != null && (
        <div className="mt-1 text-xs text-zinc-500">
          <ToolInput input={part.input as Record<string, unknown>} />
        </div>
      )}

      {done && "output" in part && (
        <div className="mt-1 border-t border-zinc-800 pt-1 text-xs text-zinc-500">
          {formatOutput(part.output)}
        </div>
      )}

      {errored && "errorText" in part && (
        <div className="mt-1 border-t border-red-900 pt-1 text-xs text-red-400">
          {truncate(String(part.errorText), 120)}
        </div>
      )}
    </div>
  );
}

function ToolInput({ input }: { input: Record<string, unknown> }) {
  const entries = Object.entries(input);
  if (entries.length === 0) return null;

  return (
    <span>
      {entries.map(([key, value], i) => (
        <span key={key}>
          {i > 0 && " · "}
          <span className="text-zinc-400">{key}:</span>{" "}
          {truncate(String(value), 60)}
        </span>
      ))}
    </span>
  );
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "\u2026" : str;
}

function formatOutput(output: unknown): string {
  if (output == null) return "done";
  if (typeof output === "string") return truncate(output, 120);
  try {
    return truncate(JSON.stringify(output), 120);
  } catch {
    return "done";
  }
}
