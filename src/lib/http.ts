/** Shared HTTP response helpers for API routes. */

/** Return a JSON error response with a standard shape. */
export function error(status: number, message: string): Response {
  return Response.json({ error: { message } }, { status });
}
