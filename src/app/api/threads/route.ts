import { db } from "@/db";
import { principal, thread } from "@/db/schema";
import { recentThreads, titleThread } from "@/db/threads";
import { verify } from "@/lib/session";
import { eq } from "drizzle-orm";

/**
 * GET /api/threads
 *
 * Returns recent threads for the authenticated user's principal.
 * Supports optional `channel` query parameter for filtering.
 */
export async function GET(req: Request) {
  const accountId = await verify();
  if (!accountId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [pal] = await db
    .select({ id: principal.id })
    .from(principal)
    .where(eq(principal.accountId, accountId))
    .limit(1);
  if (!pal) {
    return new Response("No pal configured", { status: 404 });
  }

  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") as "chat" | "email" | null;
  const threads = await recentThreads(pal.id, {
    channel: channel ?? undefined,
  });

  return Response.json(threads.map((t) => ({
    channel: t.channel,
    createdAt: t.createdAt.toISOString(),
    id: t.id,
    snippet: t.snippet?.slice(0, 120) ?? null,
    snippetAt: t.snippetAt?.toISOString() ?? null,
    snippetRole: t.snippetRole ?? null,
    title: t.title,
  })));
}

/**
 * PATCH /api/threads
 *
 * Update a thread's title. Body: { threadId, title }.
 */
export async function PATCH(req: Request) {
  const accountId = await verify();
  if (!accountId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const { threadId, title } = body as { threadId: string; title: string };
  if (!threadId || typeof title !== "string") {
    return new Response("Bad request", { status: 400 });
  }

  // Verify ownership.
  const [pal] = await db
    .select({ id: principal.id })
    .from(principal)
    .where(eq(principal.accountId, accountId))
    .limit(1);
  if (!pal) return new Response("No pal", { status: 404 });

  const [t] = await db
    .select({ principalId: thread.principalId })
    .from(thread)
    .where(eq(thread.id, threadId))
    .limit(1);
  if (!t || t.principalId !== pal.id) {
    return new Response("Not found", { status: 404 });
  }

  await titleThread(threadId, title);
  return new Response("ok");
}
