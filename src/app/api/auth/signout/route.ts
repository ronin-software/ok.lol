import { clear } from "@/lib/session";

/**
 * POST /api/auth/signout
 *
 * Clear the session cookie.
 */
export async function POST() {
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clear() } },
  );
}

/**
 * GET /api/auth/signout
 *
 * Clear the session cookie and redirect to `/sign-in`.
 * Used by server components that detect a stale session.
 */
export async function GET() {
  return new Response(null, {
    headers: {
      Location: "/sign-in",
      "Set-Cookie": clear(),
    },
    status: 307,
  });
}
