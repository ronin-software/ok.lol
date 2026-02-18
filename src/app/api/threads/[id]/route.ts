import { db } from "@/db";
import { principal, thread } from "@/db/schema";
import { threadMessages } from "@/db/threads";
import { verify } from "@/lib/session";
import { eq } from "drizzle-orm";

/**
 * GET /api/threads/:id
 *
 * Returns all messages (excluding summaries) for a thread,
 * in chronological order. Used to hydrate the chat UI.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const accountId = await verify();
  if (!accountId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: threadId } = await params;

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

  const messages = await threadMessages(threadId);

  return Response.json(messages.map((m) => ({
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    id: m.id,
    metadata: m.metadata,
    parts: m.parts,
    role: m.role,
  })));
}
