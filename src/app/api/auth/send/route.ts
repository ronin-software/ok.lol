import { z } from "zod";
import type { Platform } from "@/lib/auth";
import { createToken } from "@/lib/auth";
import { env } from "@/lib/env";
import { error } from "@/lib/http";
import { sendMagicLink } from "@/lib/resend";

const Body = z.object({
  email: z.email(),
  from: z.enum(["mobile"]).optional(),
});

/**
 * POST /api/auth/send
 *
 * Email a magic sign-in link. Always returns 200
 * to prevent email enumeration.
 *
 * Body: { email: string, from?: "mobile" }
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return error(400, "Invalid email");
  const { email, from } = parsed.data;

  const token = await createToken(email, from as Platform | undefined);
  const url = `${env.BASE_URL}/api/auth/verify?token=${token}`;

  sendMagicLink(email, url).catch((err) => {
    console.error("[auth/send] Failed to send magic link:", err);
  });

  return Response.json({ ok: true });
}
