"use client";

import { useState, useTransition } from "react";
import { saveDocument } from "./actions";
import { BUTTON_OUTLINE, CARD } from "./styles";

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
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const dirty = content !== doc.content;

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
        // Reset the baseline so "dirty" clears.
        doc.content = content;
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
