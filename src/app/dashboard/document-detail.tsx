"use client";

import { diffLines } from "diff";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActivationInput, Version } from "./actions";
import { getDocumentHistory, saveDocument } from "./actions";
import { BUTTON_OUTLINE, CARD, INPUT, LABEL } from "./styles";

/** Props supplied by the server component. */
interface Props {
  activation?: { negative?: string[]; positive?: string[] };
  content: string;
  isDefault: boolean;
  path: string;
  principalId: string;
  priority: number;
  updatedAt?: string;
  updatedBy?: "principal" | "user";
  versions: Version[];
}

export default function DocumentDetail({
  activation,
  content: initialContent,
  isDefault: initialIsDefault,
  path,
  principalId,
  priority: initialPriority,
  updatedAt,
  updatedBy,
  versions: initialVersions,
}: Props) {
  const router = useRouter();

  // Editable fields.
  const [content, setContent] = useState(initialContent);
  const [negative, setNegative] = useState(formatPhrases(activation?.negative));
  const [positive, setPositive] = useState(formatPhrases(activation?.positive));
  const [priority, setPriority] = useState(String(initialPriority));

  const [baseline, setBaseline] = useState({
    content: initialContent,
    negative: formatPhrases(activation?.negative),
    positive: formatPhrases(activation?.positive),
    priority: String(initialPriority),
  });

  const [customized, setCustomized] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [versions, setVersions] = useState(initialVersions);

  const isDefault = initialIsDefault && !customized;
  const dirty =
    content !== baseline.content ||
    negative !== baseline.negative ||
    positive !== baseline.positive ||
    priority !== baseline.priority;

  function handleSave() {
    setError("");
    setSaved(false);
    startTransition(async () => {
      const act = buildActivation(positive, negative);
      const result = await saveDocument(
        principalId,
        path,
        content,
        Number(priority) || 0,
        act,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setBaseline({ content, negative, positive, priority });
      if (initialIsDefault) setCustomized(true);

      // Refresh history.
      const fresh = await getDocumentHistory(principalId, path);
      setVersions(fresh);
    });
  }

  return (
    <>
      {/* Header */}
      <Link
        href="/dashboard/documents"
        className="mb-4 inline-block text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        ← Documents
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{path}</h1>
          <div className="mt-1 flex items-center gap-3">
            {isDefault && (
              <span className="text-xs text-zinc-500">default</span>
            )}
            {updatedAt && (
              <span className="text-xs text-zinc-600">
                {timeago(updatedAt)} by {updatedBy === "user" ? "you" : "pal"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className={CARD}>
        <div className="space-y-4">
          <div className="w-24">
            <label className={LABEL}>Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => { setPriority(e.target.value); setSaved(false); }}
              className={`mt-1 ${INPUT}`}
            />
          </div>

          <div>
            <label className={LABEL}>Content</label>
            <textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); setSaved(false); }}
              rows={16}
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
                  onChange={(e) => { setPositive(e.target.value); setSaved(false); }}
                  placeholder="one phrase per line"
                  rows={3}
                  className={`mt-1 ${TEXTAREA}`}
                />
              </div>
              <div className="flex-1">
                <label className={HINT}>Suppress when</label>
                <textarea
                  value={negative}
                  onChange={(e) => { setNegative(e.target.value); setSaved(false); }}
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
              onClick={handleSave}
              disabled={!dirty || pending}
              className={BUTTON_OUTLINE}
            >
              {pending ? "Saving..." : isDefault ? "Customize" : "Save"}
            </button>
            {saved && <span className="text-xs text-green-400">Saved</span>}
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        </div>
      </div>

      {/* History */}
      {versions.length > 0 && (
        <VersionHistory versions={versions} />
      )}
    </>
  );
}

// –
// Helpers
// –

const TEXTAREA = [
  "w-full rounded-lg border border-zinc-800 bg-zinc-950",
  "p-3 font-mono text-sm text-zinc-300",
  "placeholder-zinc-600 outline-none",
  "focus:border-zinc-600 transition-colors resize-y",
].join(" ");

const HINT = "text-xs text-zinc-600";

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

function formatPhrases(phrases?: string[]): string {
  return (phrases ?? []).join("\n");
}

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
// History
// –

function VersionHistory({ versions }: { versions: Version[] }) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="mt-8">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        History
      </p>
      <p className="mt-1 text-sm text-zinc-400">
        {versions.length} version{versions.length !== 1 && "s"}
      </p>

      <div className="mt-4 space-y-2">
        {versions.map((v, i) => {
          const isSelected = selected === i;
          const previous = i < versions.length - 1 ? versions[i + 1].content : "";

          return (
            <div key={v.createdAt}>
              <button
                onClick={() => setSelected(isSelected ? null : i)}
                className={[
                  "flex w-full items-center gap-3 rounded-lg border px-4 py-3",
                  "text-left text-sm transition-colors",
                  isSelected
                    ? "border-zinc-700 bg-zinc-800"
                    : "border-zinc-800 bg-zinc-900 hover:border-zinc-700",
                ].join(" ")}
              >
                <span className="font-medium text-white">
                  {timeago(v.createdAt)}
                </span>
                <span className="text-zinc-500">
                  by {v.editedBy === "user" ? "you" : "pal"}
                </span>
                {i === 0 && (
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                    current
                  </span>
                )}
                <span className="ml-auto text-zinc-600">
                  {isSelected ? "▾" : "▸"}
                </span>
              </button>

              {isSelected && (
                <DiffView previous={previous} next={v.content} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// –
// Diff
// –

function DiffView({ next, previous }: { next: string; previous: string }) {
  const changes = diffLines(previous, next);

  return (
    <pre className="mt-2 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm leading-relaxed">
      {changes.map((change, i) => {
        const prefix = change.added ? "+" : change.removed ? "-" : " ";
        const cls = change.added
          ? "bg-green-950/50 text-green-400"
          : change.removed
            ? "bg-red-950/50 text-red-400"
            : "text-zinc-600";

        const lines = change.value.endsWith("\n")
          ? change.value.slice(0, -1).split("\n")
          : change.value.split("\n");

        return lines.map((line, j) => (
          <div key={`${i}-${j}`} className={cls}>
            <span className="select-none text-zinc-700">{prefix} </span>
            {line}
          </div>
        ));
      })}
    </pre>
  );
}
