import { redirect } from "next/navigation";
import { verify } from "@/lib/session";

/** Auth guard: redirect unauthenticated users to sign-in. */
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await verify())) redirect("/sign-in");
  return children;
}
