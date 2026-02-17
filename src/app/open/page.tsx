import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { handoff, verify } from "@/lib/session";
import OpenRedirect from "./redirect";

/**
 * Deep-link landing page for mobile sign-in.
 *
 * Mints a short-lived handoff token and attempts to open the
 * native app via custom URL scheme. If the app isn't installed
 * the user sees a fallback link to the web dashboard.
 */
export default async function OpenPage() {
  const accountId = await verify();
  if (!accountId) redirect("/sign-in");

  const token = await handoff(accountId);

  return <OpenRedirect scheme={env.MOBILE_SCHEME} token={token} />;
}
