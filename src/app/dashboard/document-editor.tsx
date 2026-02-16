"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveDocument } from "./actions";
import { BUTTON_OUTLINE, BUTTON_PRIMARY, CARD, INPUT, LABEL } from "./styles";

/** Resolved document passed from the server component. */
export interface DocumentData {
  /** Document body. */
  content: string;
  /** True when using a system default (not yet saved by user). */
  isDefault: boolean;
  /** Hierarchical document path. */
  path: string;
  /** Injection priority. */
  priority: number;
}

/** Props for the documents section. */
interface Props {
  documents: DocumentData[];
  principalId: string;
}

/** Renders all document editors for the pal's documents. */
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
      {documents.map((doc) => (
        <DocumentCard
          key={doc.path}
          doc={doc}
          principalId={principalId}
        />
      ))}
      <NewDocumentCard principalId={principalId} />
    </div>
  );
}

// –
// Card
// –

function DocumentCard({
  doc,
  principalId,
}: {
  doc: DocumentData;
  principalId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState(doc.content);
  const [baseline, setBaseline] = useState(doc.content);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const dirty = content !== baseline;

  function handleSave() {
    setError("");
    setSaved(false);
    startTransition(async () => {
      const result = await saveDocument(
        principalId,
        doc.path,
        content,
        doc.priority,
      );
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setBaseline(content);
      }
    });
  }

  return (
    <div className={CARD}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-sm font-medium text-white">{doc.path}</p>
          {doc.isDefault && (
            <p className="text-xs text-zinc-500">default — not yet customized</p>
          )}
        </div>
        <span className="text-xs text-zinc-500">
          {expanded ? "collapse" : "edit"}
        </span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-3">
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setSaved(false);
            }}
            rows={12}
            className={[
              "w-full rounded-lg border border-zinc-800 bg-zinc-950",
              "p-3 font-mono text-sm text-zinc-300",
              "placeholder-zinc-600 outline-none",
              "focus:border-zinc-600 transition-colors resize-y",
            ].join(" ")}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!dirty || pending}
              className={BUTTON_OUTLINE}
            >
              {pending ? "Saving..." : "Save"}
            </button>
            {saved && (
              <span className="text-xs text-green-400">Saved</span>
            )}
            {error && (
              <span className="text-xs text-red-400">{error}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// –
// New document
// –

const TEXTAREA = [
  "w-full rounded-lg border border-zinc-800 bg-zinc-950",
  "p-3 font-mono text-sm text-zinc-300",
  "placeholder-zinc-600 outline-none",
  "focus:border-zinc-600 transition-colors resize-y",
].join(" ");

function NewDocumentCard({ principalId }: { principalId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [priority, setPriority] = useState("0");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const valid = path.trim().length > 0 && content.trim().length > 0;

  function reset() {
    setPath("");
    setPriority("0");
    setContent("");
    setError("");
  }

  function handleCreate() {
    setError("");
    startTransition(async () => {
      const result = await saveDocument(
        principalId,
        path.trim(),
        content,
        Number(priority) || 0,
      );
      if (result.error) {
        setError(result.error);
      } else {
        reset();
        setOpen(false);
        router.refresh();
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

          {/* Path + priority on one row */}
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
