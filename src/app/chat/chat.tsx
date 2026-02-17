"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  getToolName,
  isToolUIPart,
  type ToolUIPart,
} from "ai";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const transport = new DefaultChatTransport({ api: "/api/chat" });

export default function Chat() {
  const { error, messages, sendMessage, status } = useChat({ transport });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streaming = status === "streaming";

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Auto-focus input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function send() {
    const text = input.trim();
    if (text.length === 0 || streaming) return;
    setInput("");
    sendMessage({ text });
  }

  // Submit on Enter (without Shift).
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
        <Link
          href="/dashboard"
          className="text-xs text-zinc-500 transition-colors hover:text-white"
        >
          Dashboard
        </Link>
        <h1 className="text-sm font-medium">Chat</h1>
        <div className="w-16" />
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
          {messages.length === 0 && (
            <p className="text-center text-sm text-zinc-500 pt-24">
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

      {/* Input */}
      <div className="shrink-0 border-t border-zinc-800 bg-background">
        <div className="mx-auto flex max-w-2xl items-end gap-2 px-4 py-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message your pal..."
            rows={1}
            className={[
              "flex-1 resize-none rounded-xl border border-zinc-800",
              "bg-zinc-900 px-4 py-3 text-sm text-white",
              "placeholder-zinc-600 outline-none",
              "focus:border-zinc-600 transition-colors",
              "max-h-32 overflow-y-auto",
            ].join(" ")}
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            type="button"
            onClick={send}
            disabled={streaming || input.trim().length === 0}
            className={[
              "shrink-0 rounded-xl bg-white px-4 py-3",
              "text-sm font-medium text-black transition-colors",
              "hover:bg-zinc-200 disabled:opacity-40",
            ].join(" ")}
          >
            {streaming ? "..." : "Send"}
          </button>
        </div>
        {/* Safe area for mobile home indicator */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  );
}

// –
// Message
// –

type UIMessage = ReturnType<typeof useChat>["messages"][number];
type Part = UIMessage["parts"][number];
type ToolPart = DynamicToolUIPart | ToolUIPart;

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  // Classify parts for layout decisions.
  const textParts: Array<{ i: number; text: string }> = [];
  const toolParts: Array<{ i: number; part: ToolPart }> = [];
  for (let i = 0; i < message.parts.length; i++) {
    const part = message.parts[i]!;
    if (part.type === "text" && part.text.length > 0) {
      textParts.push({ i, text: part.text });
    } else if (isToolUIPart(part)) {
      toolParts.push({ i, part });
    }
    // step-start, empty text, etc. — silently skip.
  }

  const hasText = textParts.length > 0;
  const hasTools = toolParts.length > 0;

  if (!hasText && !hasTools) return null;

  return (
    <div className={isUser ? "flex justify-end" : ""}>
      {hasText && (
        <div
          className={[
            "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
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
        <div className="max-w-[85%] space-y-1">
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

/** Human-readable labels keyed by tool name. */
const toolLabels: Record<string, { active: string; done: string }> = {
  list_documents: { active: "Listing documents", done: "Listed documents" },
  read_document:  { active: "Reading document",  done: "Read document" },
  send_email:     { active: "Sending email",     done: "Sent email" },
  write_document: { active: "Writing document",  done: "Wrote document" },
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

      {/* Input summary while running */}
      {!done && !errored && "input" in part && part.input != null && (
        <div className="mt-1 text-xs text-zinc-500">
          <ToolInput input={part.input as Record<string, unknown>} />
        </div>
      )}

      {/* Output */}
      {done && "output" in part && (
        <div className="mt-1 border-t border-zinc-800 pt-1 text-xs text-zinc-500">
          {formatOutput(part.output)}
        </div>
      )}

      {/* Error */}
      {errored && "errorText" in part && (
        <div className="mt-1 border-t border-red-900 pt-1 text-xs text-red-400">
          {truncate(String(part.errorText), 120)}
        </div>
      )}
    </div>
  );
}

/** Render tool input as a compact summary. */
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
