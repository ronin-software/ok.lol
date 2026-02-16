import { redirect } from "next/navigation";
import { verify } from "@/lib/session";
import { db } from "@/db";
import { principal } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Auth guard: requires a session and an active pal. */
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const accountId = await verify();
  if (!accountId) redirect("/sign-in");

  const [pal] = await db
    .select({ id: principal.id })
    .from(principal)
    .where(eq(principal.accountId, accountId))
    .limit(1);
  if (!pal) redirect("/dashboard");

  return children;
}
