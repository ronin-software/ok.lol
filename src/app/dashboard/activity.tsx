export type ActivityEntry =
  | { capability: string; createdAt: string; input: unknown; kind: "log" }
  | { cost: number; createdAt: string; detail: string; kind: "usage"; resource: string };

/** Collapse capability input to a short human-readable summary. */
function summarize(input: unknown): string {
  if (input == null) return "";
  if (typeof input !== "object") return String(input);
  const obj = input as Record<string, unknown>;
  if (typeof obj.prompt === "string") {
    return obj.prompt.length > 120 ? obj.prompt.slice(0, 120) + "\u2026" : obj.prompt;
  }
  if (typeof obj.to === "string" && typeof obj.subject === "string") {
    return `to ${obj.to}: ${obj.subject}`;
  }
  if (typeof obj.from === "string" && typeof obj.subject === "string") {
    return `from ${obj.from}: ${obj.subject}`;
  }
  return JSON.stringify(input).slice(0, 120);
}

/** Format an ISO timestamp for display. Uses UTC to avoid hydration mismatch. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

export default function ActivityTable({ rows }: { rows: ActivityEntry[] }) {
  if (rows.length === 0) {
    return (
      <div className="mt-8">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Activity
        </p>
        <p className="mt-4 text-sm text-zinc-500">No activity yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Activity
      </p>
      <ul className="mt-4 space-y-1">
        {rows.map((row, i) => (
          <li
            key={i}
            className="overflow-hidden border-b border-zinc-800/50 py-2"
          >
            <div className="flex items-center justify-between gap-4">
              <span className="shrink-0 font-mono text-xs text-zinc-300">
                {row.kind === "log" ? row.capability : row.resource}
              </span>
              <div className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
                {row.kind === "usage" && (
                  <span className="tabular-nums">${row.cost.toFixed(4)}</span>
                )}
                <time dateTime={row.createdAt}>{formatTime(row.createdAt)}</time>
              </div>
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {row.kind === "log" ? summarize(row.input) : row.detail}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
