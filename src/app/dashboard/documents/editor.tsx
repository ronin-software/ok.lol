"use client";

import { diffLines } from "diff";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveDocument } from "../actions";
import { useDocuments } from "./context";
import { packExtra, parse } from "./frontmatter";

/** Props supplied by the server page component. */
interface Props {
  /** Whether this is a system default (not yet customized by user). */
  isDefault: boolean;
  /** Document path. */
  path: string;
  /** Owning principal. */
  principalId: string;
  /** Full text with frontmatter (as produced by serialize). */
  text: string;
  /** ISO timestamp of last edit. */
  updatedAt?: string;
  /** Who created this version. */
  updatedBy?: "principal" | "user";
}

export default function Editor({
  isDefault: initialIsDefault,
  path,
  principalId,
  text: initialText,
  updatedAt,
  updatedBy,
}: Props) {
  const { clearDiff, diffVersion, notifySave } = useDocuments();

  const [text, setText] = useState(initialText);
  const [baseline, setBaseline] = useState(initialText);
  const [customized, setCustomized] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const isDefault = initialIsDefault && !customized;
  const dirty = text !== baseline;

  // Stable ref so the keydown listener always sees current state.
  const saveRef = useRef<() => void>(undefined);

  // Cmd/Ctrl+S shortcut.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveRef.current?.();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleSave() {
    if (!dirty || pending) return;
    setError("");
    setSaved(false);
    startTransition(async () => {
      const { activation, body, extra, priority } = parse(text);
      const content = packExtra(extra, body);
      const result = await saveDocument(principalId, path, content, priority, activation);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setBaseline(text);
      if (initialIsDefault) setCustomized(true);
      notifySave();
    });
  }

  saveRef.current = handleSave;

  // Diff mode — show split diff instead of editor.
  if (diffVersion) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-10 shrink-0 items-center gap-3 border-b border-zinc-800 px-3">
          <button
            type="button"
            onClick={clearDiff}
            className="text-xs text-zinc-400 transition-colors hover:text-white"
          >
            ← Editor
          </button>
          <span className="text-xs text-zinc-600">{path}</span>
        </div>
        <SplitDiff current={diffVersion.current} previous={diffVersion.previous} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar — matches sidebar header height */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-zinc-800 px-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-xs font-medium text-white">{path}</h1>
          {isDefault && <span className="shrink-0 text-[11px] text-zinc-500">default</span>}
          {updatedAt && (
            <span className="shrink-0 text-[11px] text-zinc-600">
              {timeago(updatedAt)} by {updatedBy === "user" ? "you" : "pal"}
            </span>
          )}
          {saved && <span className="shrink-0 text-[11px] text-green-400">Saved</span>}
          {error && <span className="shrink-0 text-[11px] text-red-400">{error}</span>}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || pending}
          className="shrink-0 rounded px-3 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-40"
        >
          {pending ? "Saving..." : isDefault ? "Customize" : "Save"}
        </button>
      </div>

      {/* Full-bleed editor */}
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        className={TEXTAREA}
        spellCheck={false}
      />
    </div>
  );
}

const TEXTAREA = [
  "min-h-0 flex-1 resize-none border-none bg-transparent",
  "p-4 font-mono text-sm leading-relaxed text-zinc-300",
  "placeholder-zinc-600 outline-none",
].join(" ");

// –
// Split diff
// –

/** Side-by-side diff with synced scrolling. Desktop: shared container. Mobile: mirrored refs. */
function SplitDiff({ current, previous }: { current: string; previous: string }) {
  const { left, right } = useMemo(() => buildSplitLines(previous, current), [previous, current]);
  const leftRef = useRef<HTMLPreElement>(null);
  const rightRef = useRef<HTMLPreElement>(null);
  const syncing = useRef(false);

  // Mirror scroll between the two mobile panes.
  useEffect(() => {
    const l = leftRef.current;
    const r = rightRef.current;
    if (!l || !r) return;

    function sync(src: HTMLPreElement, dst: HTMLPreElement) {
      return () => {
        if (syncing.current) return;
        syncing.current = true;
        dst.scrollTop = src.scrollTop;
        syncing.current = false;
      };
    }

    const syncLR = sync(l, r);
    const syncRL = sync(r, l);
    l.addEventListener("scroll", syncLR);
    r.addEventListener("scroll", syncRL);
    return () => {
      l.removeEventListener("scroll", syncLR);
      r.removeEventListener("scroll", syncRL);
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Mobile: stacked panes, each half-height, scroll-synced via refs */}
      {/* Desktop: side-by-side with shared outer scroll (refs are inert) */}
      <DiffPane label="Previous" lines={left} empty={!previous} scrollRef={leftRef} />
      <div className="shrink-0 border-b border-zinc-800 lg:border-b-0 lg:border-l" />
      <DiffPane label="Current" lines={right} empty={!current} scrollRef={rightRef} />
    </div>
  );
}

type DiffLine = {
  cls: string;
  prefix: string;
  text: string;
};

function DiffPane({ empty, label, lines, scrollRef }: {
  empty: boolean;
  label: string;
  lines: DiffLine[];
  scrollRef: React.RefObject<HTMLPreElement | null>;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</span>
      </div>
      {empty ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-xs italic text-zinc-700">(empty)</span>
        </div>
      ) : (
        <pre ref={scrollRef} className="flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap">
          {lines.map((line, i) => (
            <div key={i} className={line.cls}>
              <span className="select-none text-zinc-700">{line.prefix} </span>
              {line.text}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

/** Build aligned left/right line arrays from a diff. */
function buildSplitLines(
  previous: string,
  current: string,
): { left: DiffLine[]; right: DiffLine[] } {
  const changes = diffLines(previous, current);
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];

  for (const change of changes) {
    const raw = change.value.endsWith("\n")
      ? change.value.slice(0, -1)
      : change.value;
    const lines = raw.split("\n");

    if (change.added) {
      for (const text of lines) {
        left.push({ cls: "text-transparent", prefix: " ", text: "" });
        right.push({ cls: "bg-green-950/50 text-green-400", prefix: "+", text });
      }
    } else if (change.removed) {
      for (const text of lines) {
        left.push({ cls: "bg-red-950/50 text-red-400", prefix: "-", text });
        right.push({ cls: "text-transparent", prefix: " ", text: "" });
      }
    } else {
      for (const text of lines) {
        const line: DiffLine = { cls: "text-zinc-600", prefix: " ", text };
        left.push(line);
        right.push(line);
      }
    }
  }

  return { left, right };
}

// –
// Helpers
// –

function timeago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
