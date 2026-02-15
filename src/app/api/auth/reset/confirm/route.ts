import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { z } from "zod";
import { db } from "@/db";
import { account } from "@/db/schema";
import { hash } from "@/lib/auth";
import { error } from "@/lib/http";
import { secret } from "@/lib/session";

const Body = z.object({
  password: z.string().min(8),
  token: z.string().min(1),
});

/**
 * POST /api/auth/reset/confirm
 *
 * Verify a reset token and set a new password.
 * Body: { token: string, password: string }
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return error(400, "Missing or invalid token/password");
  }
  const { password, token } = parsed.data;

  // Verify JWT.
  let sub: string;
  let phash: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "reset") throw new Error("wrong purpose");
    sub = payload.sub as string;
    phash = payload.phash as string;
  } catch {
    return error(401, "Invalid or expired reset link");
  }

  // Confirm the token matches the current hash.
  const row = await db
    .select({ passwordHash: account.passwordHash })
    .from(account)
    .where(eq(account.id, sub))
    .then((rows) => rows[0]);

  if (!row || row.passwordHash.slice(0, 16) !== phash) {
    return error(401, "Invalid or expired reset link");
  }

  // Update password.
  await db
    .update(account)
    .set({ passwordHash: await hash(password) })
    .where(eq(account.id, sub));

  return Response.json({ ok: true });
}
