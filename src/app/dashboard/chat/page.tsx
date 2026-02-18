import Chat from "@/app/chat/chat";
import { recentThreads, threadMessages } from "@/db/threads";
import { requirePrincipal } from "../auth";

export default async function ChatPage() {
  const { pal } = await requirePrincipal();

  const threads = await recentThreads(pal.id, { channel: "chat" });
  const serializedThreads = threads.map((t) => ({
    channel: t.channel,
    createdAt: t.createdAt.toISOString(),
    id: t.id,
    snippet: t.snippet?.slice(0, 120) ?? null,
    snippetAt: t.snippetAt?.toISOString() ?? null,
    title: t.title,
  }));

  const latest = threads[0];
  const initialMessages = latest
    ? (await threadMessages(latest.id)).map((m) => ({
        content: m.content,
        id: m.id,
        parts: m.parts as unknown[] | null,
        role: m.role,
      }))
    : [];

  return (
    <Chat
      initialMessages={initialMessages}
      initialThreadId={latest?.id}
      initialThreads={serializedThreads}
    />
  );
}
