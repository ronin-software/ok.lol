"use client";

import { useState } from "react";
import { createWorker, deleteWorker } from "./actions";
import { BUTTON_OUTLINE, BUTTON_PRIMARY, CARD, INPUT, LABEL } from "./styles";

/** Serialized worker row passed from the server component. */
export type WorkerData = {
  /** ISO timestamp. */
  createdAt: string;
  id: string;
  name: string;
  secret: string;
  url: string;
};

/** Freshly created worker — the secret banner references this. */
type Created = { id: string; secret: string };

export default function Workers({
  workers: initial,
}: {
  workers: WorkerData[];
}) {
  const [workers, setWorkers] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  function handleCreated(w: WorkerData) {
    setWorkers((prev) => [...prev, w]);
    setCreated({ id: w.id, secret: w.secret });
    setAdding(false);
  }

  function handleDeleted(id: string) {
    setWorkers((prev) => prev.filter((w) => w.id !== id));
    if (created?.id === id) setCreated(null);
  }

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between">
        <p className={LABEL}>Workers</p>
        {!adding && (
          <button onClick={() => setAdding(true)} className={BUTTON_OUTLINE}>
            Add
          </button>
        )}
      </div>

      {created && (
        <SecretBanner
          secret={created.secret}
          onDismiss={() => setCreated(null)}
        />
      )}

      {workers.length === 0 && !adding && (
        <p className="mt-4 text-sm text-zinc-500">
          No workers registered. Workers run capabilities on your machine.
        </p>
      )}

      {workers.map((w) => (
        <WorkerRow
          key={w.id}
          worker={w}
          onDelete={() => handleDeleted(w.id)}
        />
      ))}

      {adding && (
        <AddWorkerForm
          onCancel={() => setAdding(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

// –
// SecretBanner
// –

function SecretBanner({
  onDismiss,
  secret,
}: {
  onDismiss: () => void;
  secret: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-4 rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-4">
      <p className="text-sm font-medium text-emerald-400">Worker created</p>
      <p className="mt-1 text-xs text-zinc-400">
        Save your signing secret. You&apos;ll need it to run the worker daemon.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-zinc-900 px-3 py-2 font-mono text-xs text-white">
          {secret}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(secret);
            setCopied(true);
          }}
          className={BUTTON_OUTLINE}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-3 text-xs text-zinc-500">Install:</p>
      <pre className="mt-1 overflow-x-auto rounded bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
        {`curl -fsSL ${process.env.NEXT_PUBLIC_BASE_URL ?? "https://ok.lol"}/install | bash`}
      </pre>
      <p className="mt-2 text-xs text-zinc-500">Run:</p>
      <pre className="mt-1 overflow-x-auto rounded bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
        {`WORKER_SECRET=${secret} workerd`}
      </pre>
      <button
        onClick={onDismiss}
        className="mt-3 text-xs text-zinc-500 hover:text-zinc-300"
      >
        Dismiss
      </button>
    </div>
  );
}

// –
// WorkerRow
// –

function WorkerRow({
  onDelete,
  worker,
}: {
  onDelete: () => void;
  worker: WorkerData;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteWorker(worker.id);
    setDeleting(false);
    if (result.ok) onDelete();
  }

  return (
    <div className="mt-3 flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{worker.name}</p>
        <p className="truncate text-xs text-zinc-500">{worker.url}</p>
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

// –
// AddWorkerForm
// –

function AddWorkerForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (w: WorkerData) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await createWorker(name.trim(), url.trim());
    setLoading(false);

    if (result.error || !result.id || !result.secret) {
      setError(result.error ?? "Unknown error");
      return;
    }

    onCreated({
      createdAt: new Date().toISOString(),
      id: result.id,
      name: name.trim(),
      secret: result.secret,
      url: url.trim(),
    });
  }

  const valid = name.trim().length > 0 && url.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. my-laptop)"
        className={INPUT}
      />
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://my-worker.example.com"
        className={INPUT}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!valid || loading}
          className={BUTTON_PRIMARY}
        >
          {loading ? "Creating…" : "Create"}
        </button>
        <button type="button" onClick={onCancel} className={BUTTON_OUTLINE}>
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
