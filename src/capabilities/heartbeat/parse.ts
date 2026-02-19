/**
 * Proactivity document parser.
 *
 * Extracts actionable items from a principal's `proactivity` document.
 * Items are either standing (every heartbeat) or deferred (timestamped).
 * HTML comments and blank lines are ignored. Only items whose time
 * has arrived (or that have no timestamp) are returned.
 */

/** A single actionable item from the proactivity document. */
export type Item = {
  /** When the item becomes due. Absent for standing items. */
  at?: Date;
  /** The task description. */
  task: string;
};

/** Matches an ISO 8601 timestamp prefix: `2026-02-20T10:00:00Z: task text` */
const TIMESTAMP_PREFIX = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))\s*:\s*/;

/** Strips HTML comments from a string. */
const COMMENT = /<!--[\s\S]*?-->/g;

/**
 * Parse a proactivity document into actionable items due at `now`.
 *
 * - HTML comments are stripped.
 * - Blank lines are ignored.
 * - Lines starting with an ISO timestamp are deferred until that time.
 * - All other lines are standing items (always due).
 */
export function parse(content: string, now: Date = new Date()): Item[] {
  const stripped = content.replace(COMMENT, "");
  const items: Item[] = [];

  for (const raw of stripped.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const match = TIMESTAMP_PREFIX.exec(line);
    if (match) {
      const at = new Date(match[1]!);
      if (Number.isNaN(at.getTime())) continue;
      if (at > now) continue;
      items.push({ at, task: line.slice(match[0].length).trim() });
    } else {
      items.push({ task: line });
    }
  }

  return items;
}
