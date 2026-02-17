/**
 * SSH reverse tunnel to the sish relay.
 *
 * Spawns `ssh` as a child process to establish a reverse tunnel
 * so the origin can reach this worker at {id}.w.ok.lol.
 * Reconnects with exponential backoff on disconnect.
 */

// Baked in at compile time by `bun build --define`.
declare const TUNNEL_HOST: string;
declare const TUNNEL_PORT: string;

/** Resolved tunnel endpoint (compile-time defines, env overrides). */
const HOST = typeof TUNNEL_HOST !== "undefined"
  ? TUNNEL_HOST
  : (process.env.TUNNEL_HOST ?? "w.ok.lol");
const PORT = typeof TUNNEL_PORT !== "undefined"
  ? TUNNEL_PORT
  : (process.env.TUNNEL_PORT ?? "2222");

/** Backoff bounds in milliseconds. */
const MIN_DELAY = 1_000;
const MAX_DELAY = 60_000;

/** Timestamped log line. */
function log(tag: string, ...args: string[]) {
  const t = new Date().toISOString().slice(11, 23);
  console.log(`[${t}] tunnel:${tag}`, ...args);
}

/**
 * Start the SSH reverse tunnel and keep it alive.
 *
 * The tunnel maps `{workerId}.{HOST}` on the relay to
 * `localhost:{localPort}` on this machine.
 */
export function start(workerId: string, localPort: number): void {
  let delay = MIN_DELAY;

  function connect() {
    log("CONNECT", `${workerId}.${HOST} → localhost:${localPort}`);

    const proc = Bun.spawn([
      "ssh",
      "-N",
      "-R", `${workerId}:80:localhost:${localPort}`,
      "-o", "StrictHostKeyChecking=no",
      "-o", "ServerAliveInterval=30",
      "-o", "ServerAliveCountMax=3",
      "-o", "ExitOnForwardFailure=yes",
      "-p", PORT,
      `${workerId}@${HOST}`,
    ], { stdout: "inherit", stderr: "inherit" });

    proc.exited.then((code) => {
      if (code === 0) {
        log("DISCONNECT", "clean exit");
        delay = MIN_DELAY;
      } else {
        log("DISCONNECT", `exit ${code}`);
      }

      log("RECONNECT", `in ${delay}ms`);
      setTimeout(connect, delay);
      delay = Math.min(delay * 2, MAX_DELAY);
    });
  }

  connect();
}
