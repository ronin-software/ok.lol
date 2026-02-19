import { db } from "@/db";
import { principal, thread } from "@/db/schema";
import { deleteThread, threadMessages } from "@/db/threads";
import { verify } from "@/lib/session";
import { eq } from "drizzle-orm";

/** Resolve account → principal, returning null if not found. */
async function getPrincipalId(accountId: string): Promise<string | null> {
  const [pal] = await db
    .select({ id: principal.id })
    .from(principal)
    .where(eq(principal.accountId, accountId))
    .limit(1);
  return pal?.id ?? null;
}

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
  if (!accountId) return new Response("Unauthorized", { status: 401 });

  const { id: threadId } = await params;

  const principalId = await getPrincipalId(accountId);
  if (!principalId) return new Response("No pal", { status: 404 });

  const [t] = await db
    .select({ principalId: thread.principalId })
    .from(thread)
    .where(eq(thread.id, threadId))
    .limit(1);
  if (!t || t.principalId !== principalId) {
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

/**
 * DELETE /api/threads/:id
 *
 * Deletes a thread and all its messages. Ownership is verified.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const accountId = await verify();
  if (!accountId) return new Response("Unauthorized", { status: 401 });

  const { id: threadId } = await params;

  const principalId = await getPrincipalId(accountId);
  if (!principalId) return new Response("No pal", { status: 404 });

  const deleted = await deleteThread(threadId, principalId);
  if (!deleted) return new Response("Not found", { status: 404 });

  return new Response(null, { status: 204 });
}
