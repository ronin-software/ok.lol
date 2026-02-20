import { db } from "@/db";
import { thread } from "@/db/schema";
import { threadMessages } from "@/db/threads";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "../../auth";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { pal } = await requirePrincipal();
  const { id } = await params;

  const [t] = await db
    .select({ id: thread.id, title: thread.title })
    .from(thread)
    .where(and(eq(thread.id, id), eq(thread.principalId, pal.id)))
    .limit(1);

  if (!t) notFound();

  const messages = await threadMessages(id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8">
        <Link
          href="/dashboard/chat"
          className="mb-4 inline-block text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          ← Chat
        </Link>
        <h1 className="text-lg font-semibold">{t.title ?? "(no subject)"}</h1>
      </div>

      <div className="space-y-4">
        {messages.filter((m) => m.role === "user" || m.role === "assistant").length === 0 ? (
          <p className="text-sm text-zinc-500">No messages.</p>
        ) : (
          messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => <MessageRow key={m.id} message={m} />)
        )}
      </div>
    </div>
  );
}

// –
// Message display
// –

type Message = {
  content: string;
  createdAt: Date;
  id: string;
  metadata: unknown;
  role: string;
};

type EmailMeta = {
  cc?: string | string[];
  from?: string;
  messageId?: string;
  subject?: string;
  to?: string | string[];
};

function MessageRow({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const meta = message.metadata ? (message.metadata as EmailMeta) : null;
  const date = new Date(message.createdAt).toLocaleString();

  return (
    <div className={[
      "rounded-lg border px-4 py-3",
      isUser ? "border-zinc-700 bg-zinc-900" : "border-zinc-800 bg-zinc-950",
    ].join(" ")}>
      {/* Email header */}
      {meta && (
        <div className="mb-3 space-y-0.5 border-b border-zinc-800 pb-3 text-xs text-zinc-500">
          {meta.from && <p><span className="text-zinc-400">From:</span> {meta.from}</p>}
          {meta.to && (
            <p><span className="text-zinc-400">To:</span> {[meta.to].flat().join(", ")}</p>
          )}
          {meta.cc && (
            <p><span className="text-zinc-400">CC:</span> {[meta.cc].flat().join(", ")}</p>
          )}
          {meta.subject && <p><span className="text-zinc-400">Subject:</span> {meta.subject}</p>}
        </div>
      )}

      {/* Body */}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{message.content}</p>

      {/* Footer */}
      <p className="mt-2 text-right text-[11px] text-zinc-600">{date}</p>
    </div>
  );
}
