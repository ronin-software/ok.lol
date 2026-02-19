import { db } from "@/db";
import { principal } from "@/db/schema";
import { verify } from "@/lib/session";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** Landing redirect: chat if pal exists, onboard if not. After funding, settings. */
export default async function DashboardPage() {
  const accountId = await verify();
  if (!accountId) redirect("/sign-in");

  const [pal] = await db
    .select({ id: principal.id })
    .from(principal)
    .where(eq(principal.accountId, accountId))
    .limit(1);

  if (!pal) redirect("/dashboard/onboard");

  // After Stripe checkout, show the updated balance.
  const jar = await cookies();
  redirect(jar.has("funded") ? "/dashboard/more" : "/dashboard/chat");
}
