/**
 * Heartbeat workflow — wakes principals with actionable proactivity items.
 *
 * Called periodically (Vercel Cron in production, script in dev).
 * Each principal with due items gets its own durable step, so wakes
 * have independent timeouts and automatic retries.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import act from "../act";
import { getExecutionContext } from "../context";
import { parse } from "./parse";

/** Result of a single principal's heartbeat. */
type HeartbeatResult = {
  error?: string;
  items: number;
  principalId: string;
};

/** Proactivity doc row from the batch query. */
type ProactivityRow = {
  content: string;
  principal_id: string;
};

/** Serializable item for passing between workflow steps. */
type DueItem = {
  at?: string;
  task: string;
};

type DueWork = {
  items: DueItem[];
  principalId: string;
};

/**
 * Run heartbeats for all principals with due proactivity items.
 * Each wake is an isolated, retryable workflow step.
 */
export async function heartbeat(): Promise<HeartbeatResult[]> {
  "use workflow";

  const now = new Date().toISOString();
  const work = await queryDue(now);

  if (work.length === 0) return [];

  const results = await Promise.allSettled(
    work.map(({ items, principalId }) => wake(principalId, items, now)),
  );

  return work.map(({ items, principalId }, i) => {
    const result = results[i]!;
    return {
      ...(result.status === "rejected" ? { error: String((result as PromiseRejectedResult).reason) } : {}),
      items: items.length,
      principalId,
    };
  });
}

// –
// Steps
// –

/** Query all principals with due proactivity items. */
async function queryDue(now: string): Promise<DueWork[]> {
  "use step";

  const rows = await db.execute<ProactivityRow>(sql`
    SELECT DISTINCT ON (principal_id)
      principal_id, content
    FROM document
    WHERE path = 'proactivity'
    ORDER BY principal_id, created_at DESC
  `);

  const work: DueWork[] = [];
  for (const row of rows) {
    const items = parse(row.content, new Date(now));
    if (items.length > 0) {
      work.push({
        items: items.map((item) => ({
          ...(item.at ? { at: item.at.toISOString() } : {}),
          task: item.task,
        })),
        principalId: row.principal_id,
      });
    }
  }

  return work;
}

/** Wake a single principal with its due proactivity items. */
async function wake(
  principalId: string,
  items: DueItem[],
  now: string,
): Promise<void> {
  "use step";

  const ectx = await getExecutionContext({ principalId });

  const itemLines = items.map((item) =>
    item.at ? `- ${item.at}: ${item.task}` : `- ${item.task}`,
  );

  const prompt = [
    `Heartbeat. Current time: ${now}`,
    "",
    "The following items from your proactivity document are due:",
    ...itemLines,
    "",
    "Review each item and take appropriate action.",
    "For one-shot tasks (timestamped), remove them from your proactivity document after completing them.",
    "If all items are done, delete the proactivity document entirely.",
    "Stay quiet if nothing actually needs doing.",
  ].join("\n");

  const result = await act(ectx, { prompt });
  await result.text;
}
