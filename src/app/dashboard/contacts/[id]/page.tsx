import { db } from "@/db";
import { contact } from "@/db/schema";
import { threadsForContact } from "@/db/threads";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "../../auth";
import DeleteContact from "../delete";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { pal } = await requirePrincipal();
  const { id } = await params;

  const [c] = await db
    .select({
      createdAt: contact.createdAt,
      email: contact.email,
      id: contact.id,
      name: contact.name,
      relationship: contact.relationship,
    })
    .from(contact)
    .where(and(eq(contact.id, id), eq(contact.principalId, pal.id)))
    .limit(1);

  if (!c) notFound();

  const threads = c.email ? await threadsForContact(pal.id, c.email) : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/contacts"
          className="mb-4 inline-block text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          ← Contacts
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">{c.name ?? c.email ?? "Unknown"}</h1>
            {c.name && c.email && (
              <p className="mt-0.5 text-sm text-zinc-400">{c.email}</p>
            )}
          </div>
          {c.relationship === "owner" ? (
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
              you
            </span>
          ) : (
            <DeleteContact id={c.id} />
          )}
        </div>
      </div>

      {/* Threads */}
      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
          Threads
        </h2>

        {threads.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {c.email
              ? "No email threads with this contact yet."
              : "No email address — can't match threads."}
          </p>
        ) : (
          <ul className="space-y-2">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/dashboard/threads/${t.id}`}
                  className="block rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 transition-colors hover:border-zinc-700 hover:bg-zinc-800"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium text-white">
                      {t.title ?? "(no subject)"}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                        {t.channel}
                      </span>
                      {t.snippetAt && (
                        <span className="text-xs text-zinc-500">
                          {new Date(t.snippetAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {t.snippet && (
                    <p className="mt-1 truncate text-xs text-zinc-500">{t.snippet}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
