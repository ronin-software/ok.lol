import { redirect } from "next/navigation";
import { verify } from "@/lib/session";

/** Redirect authenticated users away from auth pages. */
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await verify()) redirect("/dashboard");
  return children;
}
