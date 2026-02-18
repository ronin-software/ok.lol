/**
 * Thread and message queries.
 *
 * Shared across capabilities and API routes. All thread-scoped queries
 * filter by principalId to enforce ownership at the data layer.
 */

import { and, asc, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { db } from ".";
import { message, thread } from "./schema";

// –
// Token estimation
// –

/** Rough token count: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return text ? Math.ceil(text.length / 4) : 0;
}

// –
// Thread queries
// –

/** Create a thread, returning its ID. */
export async function createThread(
  principalId: string,
  channel: "chat" | "email",
  title?: string,
): Promise<string> {
  const [row] = await db
    .insert(thread)
    .values({ channel, principalId, title })
    .returning({ id: thread.id });
  return row!.id;
}

/** Update a thread's title. */
export async function titleThread(threadId: string, title: string): Promise<void> {
  await db.update(thread).set({ title }).where(eq(thread.id, threadId));
}

/** Recent threads for a principal, with the latest message snippet. */
export async function recentThreads(
  principalId: string,
  options?: { channel?: "chat" | "email"; limit?: number },
) {
  const limit = options?.limit ?? 20;
  const conditions = [eq(thread.principalId, principalId)];
  if (options?.channel) {
    conditions.push(eq(thread.channel, options.channel));
  }

  // Subquery: latest message per thread.
  const latest = db
    .select({
      content: message.content,
      createdAt: message.createdAt,
      role: message.role,
      threadId: message.threadId,
      // Row number partitioned by thread, ordered newest first.
      rn: sql<number>`row_number() over (partition by ${message.threadId} order by ${message.createdAt} desc)`.as("rn"),
    })
    .from(message)
    .where(and(
      // Exclude summaries from the snippet.
      sql`${message.role} != 'summary'`,
    ))
    .as("latest");

  const rows = await db
    .select({
      channel: thread.channel,
      createdAt: thread.createdAt,
      id: thread.id,
      snippet: latest.content,
      snippetAt: latest.createdAt,
      snippetRole: latest.role,
      title: thread.title,
    })
    .from(thread)
    .leftJoin(latest, and(eq(latest.threadId, thread.id), eq(latest.rn, 1)))
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${latest.createdAt}, ${thread.createdAt})`))
    .limit(limit);

  return rows;
}

// –
// Message queries
// –

/** Insert a message into a thread. Returns the message ID. */
export async function insertMessage(values: {
  content: string;
  metadata?: unknown;
  parts?: unknown;
  role: "user" | "assistant" | "tool" | "summary";
  threadId: string;
  tokens?: number;
}): Promise<string> {
  const [row] = await db
    .insert(message)
    .values({
      content: values.content,
      metadata: values.metadata ?? null,
      parts: values.parts ?? null,
      role: values.role,
      threadId: values.threadId,
      tokens: values.tokens ?? estimateTokens(values.content),
    })
    .returning({ id: message.id });
  return row!.id;
}

/**
 * Active context: messages not yet covered by a summary.
 * Returns summaries and unsummarized messages in chronological order.
 */
export async function activeContext(threadId: string) {
  return db
    .select()
    .from(message)
    .where(and(eq(message.threadId, threadId), isNull(message.summaryId)))
    .orderBy(asc(message.createdAt));
}

/** Total estimated tokens of the active context for a thread. */
export async function activeTokens(threadId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${message.tokens}), 0)` })
    .from(message)
    .where(and(eq(message.threadId, threadId), isNull(message.summaryId)));
  return Number(row!.total);
}

/** Children of a summary: messages/summaries whose summaryId points to it. */
export async function children(summaryId: string) {
  return db
    .select()
    .from(message)
    .where(eq(message.summaryId, summaryId))
    .orderBy(asc(message.createdAt));
}

/** Recursively expand a summary to leaf messages. */
export async function expand(summaryId: string): Promise<typeof message.$inferSelect[]> {
  const kids = await children(summaryId);
  const result: typeof message.$inferSelect[] = [];

  for (const kid of kids) {
    if (kid.role === "summary") {
      result.push(...await expand(kid.id));
    } else {
      result.push(kid);
    }
  }

  return result;
}

/** Mark messages as covered by a summary. */
export async function coverMessages(messageIds: string[], summaryId: string): Promise<void> {
  if (messageIds.length === 0) return;
  await db
    .update(message)
    .set({ summaryId })
    .where(sql`${message.id} in ${messageIds}`);
}

/** Text search across messages in a principal's threads. */
export async function searchMessages(
  principalId: string,
  query: string,
  limit = 20,
) {
  const pattern = `%${query}%`;

  return db
    .select({
      content: message.content,
      createdAt: message.createdAt,
      id: message.id,
      role: message.role,
      threadId: message.threadId,
      threadTitle: thread.title,
    })
    .from(message)
    .innerJoin(thread, eq(message.threadId, thread.id))
    .where(and(
      eq(thread.principalId, principalId),
      ilike(message.content, pattern),
    ))
    .orderBy(desc(message.createdAt))
    .limit(limit);
}

/**
 * All messages in a thread, in chronological order.
 * For the user-facing view (excludes summaries).
 */
export async function threadMessages(threadId: string) {
  return db
    .select()
    .from(message)
    .where(and(
      eq(message.threadId, threadId),
      sql`${message.role} != 'summary'`,
    ))
    .orderBy(asc(message.createdAt));
}

/** Find an email thread by Resend message-id references or normalized subject. */
export async function findEmailThread(
  principalId: string,
  references: string[],
  normalizedSubject: string,
): Promise<string | null> {
  // Try matching by email message-id in metadata.
  if (references.length > 0) {
    for (const ref of references) {
      const [match] = await db
        .select({ threadId: message.threadId })
        .from(message)
        .innerJoin(thread, eq(message.threadId, thread.id))
        .where(and(
          eq(thread.principalId, principalId),
          eq(thread.channel, "email"),
          sql`${message.metadata}->>'messageId' = ${ref}`,
        ))
        .limit(1);
      if (match) return match.threadId;
    }
  }

  // Fallback: match by normalized subject.
  const [match] = await db
    .select({ id: thread.id })
    .from(thread)
    .where(and(
      eq(thread.principalId, principalId),
      eq(thread.channel, "email"),
      eq(thread.title, normalizedSubject),
    ))
    .orderBy(desc(thread.createdAt))
    .limit(1);

  return match?.id ?? null;
}
