/**
 * Auto-update poller.
 *
 * Periodically checks GitHub Releases for a newer signed release manifest.
 * On match: downloads the platform binary, verifies its SHA-256 digest,
 * replaces the running binary on disk, and exits with code 75 (restart).
 */

import { chmod, rename, writeFile } from "node:fs/promises";
import { ed25519verify } from "./sign";

/** One hour in milliseconds. */
const INTERVAL = 60 * 60 * 1000;

/** Exit code signaling "restart with the new binary". */
const EXIT_RESTART = 75;

/** GitHub repo for release lookups. */
const REPO = "ronin-software/ok.lol";

/** Release manifest shape. */
interface Manifest {
  artifacts: Record<string, { sha256: string; url: string }>;
  version: string;
}

/** Timestamped log line. */
function log(tag: string, ...args: string[]) {
  const t = new Date().toISOString().slice(11, 23);
  console.log(`[${t}] update:${tag}`, ...args);
}

/** Resolve current platform key (e.g. "darwin-arm64"). */
function platform(): string {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `${os}-${arch}`;
}

/**
 * Start the background update poller.
 *
 * Checks immediately on startup, then every hour.
 * Failures are logged and swallowed — the daemon keeps running.
 */
export function start(version: string, publicKey: string): void {
  const check = () => void poll(version, publicKey).catch((e) => {
    log("ERROR", String(e));
  });

  // Initial check after a short delay so the server can bind first.
  setTimeout(check, 5_000);
  setInterval(check, INTERVAL);
}

// –
// Poll
// –

async function poll(current: string, publicKey: string): Promise<void> {
  const base = `https://api.github.com/repos/${REPO}/releases`;
  const res = await fetch(`${base}?per_page=5`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    log("SKIP", `GitHub API ${res.status}`);
    return;
  }

  const releases = (await res.json()) as Array<{
    assets: Array<{ browser_download_url: string; name: string }>;
    tag_name: string;
  }>;

  // Find the first worker release.
  const release = releases.find((r) => r.tag_name.startsWith("worker-v"));
  if (!release) {
    log("SKIP", "no worker release found");
    return;
  }

  const manifestAsset = release.assets.find((a) => a.name === "release.json");
  const sigAsset = release.assets.find((a) => a.name === "release.json.sig");
  if (!manifestAsset || !sigAsset) {
    log("SKIP", "release missing manifest or signature");
    return;
  }

  // Fetch manifest + signature.
  const [manifestBytes, sigText] = await Promise.all([
    fetch(manifestAsset.browser_download_url).then((r) => r.arrayBuffer()),
    fetch(sigAsset.browser_download_url).then((r) => r.text()),
  ]);

  // Verify signature.
  const data = new Uint8Array(manifestBytes);
  if (!ed25519verify(data, sigText.trim(), publicKey)) {
    log("REJECT", "invalid signature");
    return;
  }

  const manifest: Manifest = JSON.parse(new TextDecoder().decode(data));

  // Compare versions (simple string compare — semver tags sort lexically when zero-padded).
  if (manifest.version <= current) {
    log("OK", `v${current} is up to date`);
    return;
  }

  log("UPDATE", `v${current} → v${manifest.version}`);

  const plat = platform();
  const artifact = manifest.artifacts[plat];
  if (!artifact) {
    log("SKIP", `no artifact for ${plat}`);
    return;
  }

  // Download new binary.
  const binRes = await fetch(artifact.url);
  if (!binRes.ok) {
    log("ERROR", `download failed: ${binRes.status}`);
    return;
  }
  const bin = new Uint8Array(await binRes.arrayBuffer());

  // Verify SHA-256.
  const hash = new Bun.CryptoHasher("sha256").update(bin).digest("hex");
  if (hash !== artifact.sha256) {
    log("REJECT", `sha256 mismatch: expected ${artifact.sha256.slice(0, 16)}…, got ${hash.slice(0, 16)}…`);
    return;
  }

  // Replace binary on disk.
  const exe = process.execPath;
  const staging = `${exe}.new`;
  const backup = `${exe}.old`;

  await writeFile(staging, bin);
  await chmod(staging, 0o755);

  // Atomic-ish swap: current → .old, .new → current.
  try {
    await rename(exe, backup);
  } catch {
    // First install or .old already cleaned up — fine.
  }
  await rename(staging, exe);

  log("RESTART", `updated to v${manifest.version}`);
  process.exit(EXIT_RESTART);
}
