import { db } from "@/db";
import { contact } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { requirePrincipal } from "../auth";
import AddContact from "./add";

export default async function ContactsPage() {
  const { pal } = await requirePrincipal();

  const contacts = await db
    .select({
      createdAt: contact.createdAt,
      email: contact.email,
      id: contact.id,
      name: contact.name,
      relationship: contact.relationship,
    })
    .from(contact)
    .where(eq(contact.principalId, pal.id))
    .orderBy(desc(contact.createdAt));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contacts</h1>
          <p className="mt-1 text-sm text-zinc-400">
            People your pal knows.
          </p>
        </div>
        <AddContact principalId={pal.id} />
      </div>

      {contacts.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500">
          No contacts yet. Add one or let your pal discover people as it
          interacts.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {contacts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/contacts/${c.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 transition-colors hover:border-zinc-700 hover:bg-zinc-800"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    {c.name ?? c.email ?? "Unknown"}
                  </p>
                  {c.email && c.name && (
                    <p className="text-xs text-zinc-500">{c.email}</p>
                  )}
                </div>
                {c.relationship === "owner" && (
                  <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                    you
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
