/**
 * Heartbeat cron endpoint.
 *
 * Vercel Cron hits this on a schedule. Authenticated via CRON_SECRET
 * in the `Authorization: Bearer <secret>` header.
 */

import { heartbeat } from "@/capabilities/heartbeat";
import { env } from "@/lib/env";

export async function GET(request: Request) {
  const secret = env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const results = await heartbeat();

  return Response.json({
    processed: results.length,
    results,
    time: new Date().toISOString(),
  });
}
