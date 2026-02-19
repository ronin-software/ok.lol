/**
 * Local dev heartbeat runner.
 *
 * Calls the heartbeat logic directly (no HTTP).
 *
 *   bun run heartbeat            # once
 *   bun run heartbeat --loop     # every 15 minutes
 */

import { heartbeat } from "@/capabilities/heartbeat";

const INTERVAL_MS = 15 * 60 * 1000;
const loop = process.argv.includes("--loop");

async function run() {
  const start = Date.now();
  console.log(`[heartbeat] ${new Date().toISOString()}`);

  try {
    const results = await heartbeat();
    if (results.length === 0) {
      console.log("[heartbeat] no actionable items");
    } else {
      for (const r of results) {
        const status = r.error ? `error: ${r.error}` : "ok";
        console.log(`[heartbeat] ${r.principalId} — ${r.items} items — ${status}`);
      }
    }
  } catch (err) {
    console.error("[heartbeat] fatal:", err);
  }

  console.log(`[heartbeat] done in ${Date.now() - start}ms`);
}

await run();

if (loop) {
  console.log(`[heartbeat] looping every ${INTERVAL_MS / 60_000}m`);
  setInterval(run, INTERVAL_MS);
}
