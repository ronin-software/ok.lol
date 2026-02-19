import { toolLabels } from "@/app/chat/labels";
import { db } from "@/db";
import { thread } from "@/db/schema";
import { toolCallMessages } from "@/db/threads";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "../../../auth";

export default async function ToolCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { pal } = await requirePrincipal();
  const { id: toolCallId } = await params;

  const rows = await toolCallMessages(toolCallId);
  if (rows.length === 0) notFound();

  // Verify ownership via the thread.
  const [t] = await db
    .select({ principalId: thread.principalId })
    .from(thread)
    .where(eq(thread.id, rows[0]!.threadId))
    .limit(1);
  if (!t || t.principalId !== pal.id) notFound();

  // First row = the call, second = the result.
  const callRow = rows[0]!;
  const resultRow = rows.length > 1 ? rows[1]! : null;
  const meta = callRow.metadata as { toolCallId: string; toolName: string } | null;
  const toolName = meta?.toolName ?? "unknown";
  const labels = toolLabels[toolName];

  // Parse the call content: { input, name }.
  let input: unknown = null;
  try { input = JSON.parse(callRow.content).input; } catch { /* raw content */ }

  // Result content is the raw output string.
  const output = resultRow?.content ?? null;
  let outputParsed: unknown = output;
  if (output) {
    try { outputParsed = JSON.parse(output); } catch { /* keep as string */ }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/dashboard/chat"
        className="mb-6 inline-block text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        ← Chat
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
        <h1 className="text-lg font-semibold">{labels?.done ?? toolName}</h1>
      </div>

      <div className="space-y-6">
        {/* Input */}
        <Section title="Input">
          <Pre>{formatJson(input)}</Pre>
        </Section>

        {/* Output */}
        <Section title="Output">
          {output
            ? <Pre>{formatJson(outputParsed)}</Pre>
            : <p className="text-sm text-zinc-500">No output recorded.</p>
          }
        </Section>

        {/* Metadata */}
        <div className="flex gap-6 text-xs text-zinc-500">
          <span>Tool: <span className="text-zinc-400">{toolName}</span></span>
          <span>ID: <span className="font-mono text-zinc-400">{toolCallId}</span></span>
          <span>{callRow.createdAt.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// –
// Layout
// –

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-medium text-zinc-400">{title}</h2>
      {children}
    </div>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function formatJson(value: unknown): string {
  if (value == null) return "(empty)";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
