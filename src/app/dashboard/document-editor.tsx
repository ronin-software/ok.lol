"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActivationInput } from "./actions";
import { saveDocument } from "./actions";
import { BUTTON_PRIMARY, CARD, INPUT, LABEL } from "./styles";

/** Resolved document passed from the server component. */
export interface DocumentData {
  /** Relevance filtering phrases (no embeddings). */
  activation?: { negative?: string[]; positive?: string[] };
  /** Document body. */
  content: string;
  /** True when using a system default (not yet saved by user). */
  isDefault: boolean;
  /** Hierarchical document path. */
  path: string;
  /** Injection priority (lower = earlier). */
  priority: number;
  /** ISO timestamp of last edit. Absent on defaults. */
  updatedAt?: string;
  /** Who created the current version. Absent on defaults. */
  updatedBy?: "principal" | "user";
}

/** Props for the documents section. */
interface Props {
  documents: DocumentData[];
  principalId: string;
}

/** Renders the document list with links to detail pages. */
export default function DocumentsSection({ documents, principalId }: Props) {
  return (
    <div className="mt-8">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Documents
      </p>
      <p className="mt-1 text-sm text-zinc-400">
        These shape your pal&apos;s personality and memory. Edits create new
        versions — nothing is lost.
      </p>
      <div className="mt-4 space-y-2">
        {documents.map((doc) => (
          <DocumentLink key={doc.path} doc={doc} />
        ))}
      </div>
      <NewDocumentCard principalId={principalId} />
    </div>
  );
}

// –
// Link card
// –

function DocumentLink({ doc }: { doc: DocumentData }) {
  return (
    <Link
      href={`/dashboard/documents/${encodeURIComponent(doc.path)}`}
      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 transition-colors hover:border-zinc-700 hover:bg-zinc-800"
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-white">{doc.path}</span>
        <span className="text-xs text-zinc-600">{doc.priority}</span>
        {doc.activation && (
          <span className="text-xs text-zinc-600">conditional</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {doc.updatedAt && (
          <span className="text-xs text-zinc-600">
            {timeago(doc.updatedAt)} by{" "}
            {doc.updatedBy === "user" ? "you" : "pal"}
          </span>
        )}
        {doc.isDefault && (
          <span className="text-xs text-zinc-500">default</span>
        )}
      </div>
    </Link>
  );
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

const TEXTAREA = [
  "w-full rounded-lg border border-zinc-800 bg-zinc-950",
  "p-3 font-mono text-sm text-zinc-300",
  "placeholder-zinc-600 outline-none",
  "focus:border-zinc-600 transition-colors resize-y",
].join(" ");

const HINT = "text-xs text-zinc-600";

function parsePhrases(text: string): string[] {
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}

function buildActivation(
  positive: string,
  negative: string,
): ActivationInput | undefined {
  const pos = parsePhrases(positive);
  const neg = parsePhrases(negative);
  if (!pos.length && !neg.length) return undefined;
  return {
    ...(neg.length ? { negative: neg } : {}),
    ...(pos.length ? { positive: pos } : {}),
  };
}

// –
// New document
// –

function NewDocumentCard({ principalId }: { principalId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [negative, setNegative] = useState("");
  const [path, setPath] = useState("");
  const [pending, startTransition] = useTransition();
  const [positive, setPositive] = useState("");
  const [priority, setPriority] = useState("0");

  const valid = path.trim().length > 0 && content.trim().length > 0;

  function reset() {
    setContent("");
    setError("");
    setNegative("");
    setPath("");
    setPositive("");
    setPriority("0");
  }

  function handleCreate() {
    setError("");
    startTransition(async () => {
      const result = await saveDocument(
        principalId,
        path.trim(),
        content,
        Number(priority) || 0,
        buildActivation(positive, negative),
      );
      if (result.error) {
        setError(result.error);
      } else {
        reset();
        setOpen(false);
        router.push(`/dashboard/documents/${encodeURIComponent(path.trim())}`);
      }
    });
  }

  return (
    <div className={CARD}>
      {open ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">New document</p>
            <button
              onClick={() => { reset(); setOpen(false); }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              cancel
            </button>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={LABEL}>Path</label>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="e.g. skills/cooking"
                className={`mt-1 ${INPUT}`}
              />
            </div>
            <div className="w-24">
              <label className={LABEL}>Priority</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={`mt-1 ${INPUT}`}
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Document body..."
              rows={8}
              className={`mt-1 ${TEXTAREA}`}
            />
          </div>

          {/* Activation */}
          <div>
            <label className={LABEL}>Activation</label>
            <div className="mt-1 flex gap-3">
              <div className="flex-1">
                <label className={HINT}>Inject when</label>
                <textarea
                  value={positive}
                  onChange={(e) => setPositive(e.target.value)}
                  placeholder="one phrase per line"
                  rows={3}
                  className={`mt-1 ${TEXTAREA}`}
                />
              </div>
              <div className="flex-1">
                <label className={HINT}>Suppress when</label>
                <textarea
                  value={negative}
                  onChange={(e) => setNegative(e.target.value)}
                  placeholder="one phrase per line"
                  rows={3}
                  className={`mt-1 ${TEXTAREA}`}
                />
              </div>
            </div>
            <p className={`mt-1 ${HINT}`}>Leave empty to always inject</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCreate}
              disabled={!valid || pending}
              className={BUTTON_PRIMARY}
            >
              {pending ? "Creating..." : "Create"}
            </button>
            {error && (
              <span className="text-xs text-red-400">{error}</span>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          + Add document
        </button>
      )}
    </div>
  );
}
