import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { z } from "zod";
import { db } from "@/db";
import { account } from "@/db/schema";
import { env } from "@/lib/env";
import { error } from "@/lib/http";
import { sendResetEmail } from "@/lib/resend";
import { secret } from "@/lib/session";

const Body = z.object({ email: z.string().email() });

/**
 * POST /api/auth/reset
 *
 * Send a password reset email.
 * Always returns 200 to prevent email enumeration.
 *
 * Body: { email: string }
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return error(400, "Missing email");
  const { email } = parsed.data;

  const row = await db
    .select({ id: account.id, passwordHash: account.passwordHash })
    .from(account)
    .where(eq(account.email, email))
    .then((rows) => rows[0]);

  // Send in background; always return 200.
  if (row) {
    const token = await new SignJWT({
      // First 16 chars of hash — self-invalidates when password changes.
      phash: row.passwordHash.slice(0, 16),
      purpose: "reset",
    })
      .setSubject(row.id)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret());

    const url = `${env.BASE_URL}/reset?token=${token}`;
    sendResetEmail(email, url).catch((err) => {
      console.error("[reset] Failed to send email:", err);
    });
  }

  return Response.json({ ok: true });
}
