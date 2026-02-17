"use client";

import { useEffect, useRef, useState } from "react";
import { createWorker, deleteWorker, probeWorker } from "./actions";
import { BUTTON_OUTLINE, BUTTON_PRIMARY, CARD, LABEL } from "./styles";

/** Serialized worker row passed from the server component. */
export type WorkerData = {
  /** ISO timestamp. */
  createdAt: string;
  id: string;
  /** Hostname reported by the worker. Null until first probe. */
  name: string | null;
  secret: string;
  url: string;
};

export default function Workers({
  workers: initial,
}: {
  workers: WorkerData[];
}) {
  const [workers, setWorkers] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    setLoading(true);
    setError("");

    const result = await createWorker();
    setLoading(false);

    if (result.error || !result.id || !result.secret) {
      setError(result.error ?? "Unknown error");
      return;
    }

    const { id, secret } = result;
    setWorkers((prev) => [
      { createdAt: new Date().toISOString(), id, name: null, secret, url: "" },
      ...prev,
    ]);
  }

  function handleDeleted(id: string) {
    setWorkers((prev) => prev.filter((w) => w.id !== id));
  }

  function handleConnected(id: string, name: string) {
    setWorkers((prev) =>
      prev.map((w) => (w.id === id ? { ...w, name } : w)),
    );
  }

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between">
        <p className={LABEL}>Workers</p>
        <button
          onClick={handleAdd}
          disabled={loading}
          className={BUTTON_PRIMARY}
        >
          {loading ? "Creating…" : "Add worker"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {workers.length === 0 && (
        <p className="mt-4 text-sm text-zinc-500">
          No workers registered. Workers run capabilities on your machine.
        </p>
      )}

      {workers.map((w) => (
        <WorkerRow
          key={w.id}
          worker={w}
          onConnected={(name) => handleConnected(w.id, name)}
          onDelete={() => handleDeleted(w.id)}
        />
      ))}
    </div>
  );
}

// –
// WorkerRow
// –

/** Poll interval for pending workers. */
const POLL_INTERVAL = 3_000;

function WorkerRow({
  onConnected,
  onDelete,
  worker,
}: {
  onConnected: (name: string) => void;
  onDelete: () => void;
  worker: WorkerData;
}) {
  const pending = worker.name == null;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Poll for name while pending.
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  useEffect(() => {
    if (!pending) return;
    let active = true;

    const timer = setInterval(async () => {
      const result = await probeWorker(worker.id);
      if (result.name && active) onConnectedRef.current(result.name);
    }, POLL_INTERVAL);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pending, worker.id]);

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteWorker(worker.id);
    setDeleting(false);
    if (result.ok) onDelete();
  }

  if (pending) {
    const token = `${worker.id}:${worker.secret}`;
    const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://ok.lol").replace(/^https?:\/\//, "");
    const cmd = `curl -fsSL ${base}/install|sh&&WORKER_TOKEN=${token} workerd`;

    return (
      <div className="mt-3 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <p className="text-sm font-medium text-emerald-400">
              Waiting for connection…
            </p>
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-red-400 hover:text-red-300"
          >
            {deleting ? "…" : "Cancel"}
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <pre className="flex-1 overflow-x-auto rounded bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-300">
            {cmd}
          </pre>
          <button
            onClick={() => {
              navigator.clipboard.writeText(cmd);
              setCopied(true);
            }}
            className={BUTTON_OUTLINE}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{worker.name}</p>
        <p className="truncate text-xs text-zinc-500">{worker.id}</p>
      </div>
      {confirming ? (
        <div className="flex gap-2">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-red-400 hover:text-red-300"
          >
            {deleting ? "…" : "Confirm"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Remove
        </button>
      )}
    </div>
  );
}
