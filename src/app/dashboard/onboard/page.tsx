import { db } from "@/db";
import { principal } from "@/db/schema";
import { env } from "@/lib/env";
import { verify } from "@/lib/session";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Wizard from "./wizard";

/** Pal creation wizard. Redirects away if a pal already exists. */
export default async function OnboardPage() {
  const accountId = await verify();
  if (!accountId) redirect("/sign-in");

  const [pal] = await db
    .select({ id: principal.id })
    .from(principal)
    .where(eq(principal.accountId, accountId))
    .limit(1);

  if (pal) redirect("/dashboard/chat");

  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <Wizard domain={env.EMAIL_DOMAIN} />
    </Suspense>
  );
}
