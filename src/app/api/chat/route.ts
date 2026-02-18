import { getExecutionContext } from "@/capabilities/_execution-context";
import act from "@/capabilities/act";
import { autoTitle, persistOutput } from "@/capabilities/act/dispatch";
import { summarizeIfNeeded } from "@/capabilities/threads/summarize";
import { createThread, insertMessage } from "@/db/threads";
import { verify } from "@/lib/session";
import type { UIMessage } from "ai";
import { after } from "next/server";

/**
 * POST /api/chat
 *
 * Thread-aware streaming chat endpoint. Persists every message and
 * the assistant's response. Creates a new thread if none is provided.
 */
export async function POST(req: Request) {
  const accountId = await verify();
  if (!accountId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const ectx = await getExecutionContext({ accountId });

  const body = await req.json();
  const messages: UIMessage[] = body.messages ?? [];
  let threadId: string | undefined = body.threadId;

  if (!threadId) {
    threadId = await createThread(ectx.principal.id, "chat");
  }

  // Persist the latest user message.
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  let userText = "";
  if (lastUserMessage) {
    userText = lastUserMessage.parts
      .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
      .map((p) => p.text)
      .join("");

    await insertMessage({
      content: userText,
      parts: lastUserMessage.parts,
      role: "user",
      threadId,
    });
  }

  await summarizeIfNeeded(threadId);

  const result = await act(ectx, { messages });
  const capturedThreadId = threadId;
  const capturedUserText = userText;

  const stream = result.toUIMessageStreamResponse({
    headers: { "X-Thread-Id": capturedThreadId },
  });

  after(async () => {
    const assistantText = await persistOutput(result, capturedThreadId);
    await autoTitle(capturedThreadId, capturedUserText, assistantText);
  });

  return stream;
}
