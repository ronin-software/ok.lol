import { redirect } from "next/navigation";
import { verify } from "@/lib/session";

/** Redirect to dashboard if authenticated, sign-up if not. */
export default async function RootPage() {
  const accountId = await verify();
  redirect(accountId ? "/dashboard" : "/sign-in");
}
