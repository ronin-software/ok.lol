import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { account } from "@/db/schema";
import { error } from "@/lib/http";
import { verifyPassword } from "@/lib/auth";
import { create as createSession } from "@/lib/session";

const Body = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/**
 * POST /api/auth/signin
 *
 * Verify email + password and set a session cookie.
 * Body: { email: string, password: string }
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return error(400, "Missing email or password");
  const { email, password } = parsed.data;

  const row = await db
    .select({ id: account.id, passwordHash: account.passwordHash })
    .from(account)
    .where(eq(account.email, email))
    .then((rows) => rows[0]);

  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    return error(401, "Invalid email or password");
  }

  const cookie = await createSession(row.id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
