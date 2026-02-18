import act from "@/capabilities/act";
import type { OriginExecutionContext } from "@/capabilities/_execution-context";
import { summarizeIfNeeded } from "@/capabilities/threads/summarize";
import { db } from "@/db";
import { currentDocuments } from "@/db/documents";
import { principal, thread } from "@/db/schema";
import { createThread, insertMessage, titleThread } from "@/db/threads";
import { verify } from "@/lib/session";
import { available, lookupAccount } from "@/lib/tigerbeetle";
import type { UIMessage } from "ai";
import { createGateway, generateText } from "ai";
import { eq } from "drizzle-orm";
import { after } from "next/server";

const gateway = createGateway();

/** Cheap model for auto-titling threads. */
const TITLE_MODEL = "anthropic/claude-3-5-haiku-20241022";

/**
 * POST /api/chat
 *
 * Thread-aware streaming chat endpoint. Persists every message and
 * the assistant's response. Creates a new thread if none is provided,
 * auto-resumes the latest chat thread if the client sends no threadId.
 */
export async function POST(req: Request) {
  const accountId = await verify();
  if (!accountId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [pal] = await db
    .select()
    .from(principal)
    .where(eq(principal.accountId, accountId))
    .limit(1);
  if (!pal) {
    return new Response("No pal configured", { status: 404 });
  }

  const body = await req.json();
  const messages: UIMessage[] = body.messages ?? [];
  let threadId: string | undefined = body.threadId;

  // Resolve or create thread.
  if (!threadId) {
    threadId = await createThread(pal.id, "chat");
  }

  // Persist the latest user message (last in the array).
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (lastUserMessage) {
    const textContent = lastUserMessage.parts
      .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
      .map((p) => p.text)
      .join("");

    await insertMessage({
      content: textContent,
      parts: lastUserMessage.parts,
      role: "user",
      threadId,
    });
  }

  // Summarize if context is getting large.
  await summarizeIfNeeded(threadId);

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
      name: pal.name,
      username: pal.username,
    },
  };

  // The client sends the full conversation history (including prior turns it loaded
  // via setMessages). Pass that directly to the model — no DB round-trip needed here.
  // The DB is used for persistence and the user-facing history view, not model input.
  const result = await act(ectx, { messages, threadId });

  // Persist assistant response and optionally auto-title after streaming completes.
  const capturedThreadId = threadId;
  const stream = result.toUIMessageStreamResponse({
    headers: { "X-Thread-Id": capturedThreadId },
  });

  // Persist assistant output and auto-title after the response is sent.
  // `after` keeps the function alive until the work is done.
  after(async () => {
    const text = await result.text;

    if (text.length > 0) {
      await insertMessage({
        content: text,
        role: "assistant",
        threadId: capturedThreadId,
      });
    }

    // Auto-title untitled threads after the first exchange.
    const [t] = await db
      .select({ title: thread.title })
      .from(thread)
      .where(eq(thread.id, capturedThreadId))
      .limit(1);

    if (t && !t.title && lastUserMessage) {
      await autoTitle(capturedThreadId, lastUserMessage, text);
    }
  });

  return stream;
}

// –
// Auto-titling
// –

/** Generate a short title from the first user message and assistant response. */
async function autoTitle(
  threadId: string,
  userMessage: UIMessage,
  assistantText: string,
): Promise<void> {
  const userText = userMessage.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");

  const { text: title } = await generateText({
    model: gateway(TITLE_MODEL),
    prompt: `User: ${userText.slice(0, 500)}\n\nAssistant: ${assistantText.slice(0, 500)}`,
    system: "Generate a short title (3-6 words) for this conversation. Return only the title, nothing else.",
  });

  if (title.length > 0) {
    await titleThread(threadId, title.slice(0, 100));
  }
}
