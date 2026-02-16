import act from "@/capabilities/act";
import type { OriginExecutionContext } from "@/capabilities/_execution-context";
import { db } from "@/db";
import { currentDocuments } from "@/db/documents";
import { principal } from "@/db/schema";
import { verify } from "@/lib/session";
import { available, lookupAccount } from "@/lib/tigerbeetle";
import { eq } from "drizzle-orm";

/**
 * POST /api/chat
 *
 * Streaming chat endpoint. Accepts the AI SDK UI message format
 * from `useChat`, delegates to the unified `act` loop, and streams
 * the response back via `toUIMessageStreamResponse()`.
 */
export async function POST(req: Request) {
  const accountId = await verify();
  if (!accountId) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Resolve principal for this account.
  const [pal] = await db
    .select()
    .from(principal)
    .where(eq(principal.accountId, accountId))
    .limit(1);
  if (!pal) {
    return new Response("No pal configured", { status: 404 });
  }

  // Build execution context.
  const [docs, tbAccount] = await Promise.all([
    currentDocuments(pal.id),
    lookupAccount(BigInt(accountId)),
  ]);

  const ectx: OriginExecutionContext = {
    principal: {
      accountId,
      credits: tbAccount ? available(tbAccount) : 0n,
      documents: docs,
      id: pal.id,
      username: pal.username,
    },
  };

  const { messages } = await req.json();
  const result = await act(ectx, { messages });
  return result.toUIMessageStreamResponse();
}
