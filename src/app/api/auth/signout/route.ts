import { clear } from "@/lib/session";

/** Expire the platform cookie alongside the session. */
const CLEAR_PLATFORM =
  "platform=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";

/**
 * POST /api/auth/signout
 *
 * Clear the session cookie.
 */
export async function POST() {
  return Response.json(
    { ok: true },
    {
      headers: [
        ["Set-Cookie", clear()],
        ["Set-Cookie", CLEAR_PLATFORM],
      ],
    },
  );
}

/**
 * GET /api/auth/signout
 *
 * Clear the session cookie and redirect to /sign-in.
 * Used by server components that detect a stale session.
 */
export async function GET() {
  return new Response(null, {
    headers: [
      ["Location", "/sign-in"],
      ["Set-Cookie", clear()],
      ["Set-Cookie", CLEAR_PLATFORM],
    ],
    status: 307,
  });
}
