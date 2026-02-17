#!/usr/bin/env bun
/**
 * Build workerd for all supported platforms.
 *
 * Cross-compiles via `bun build --compile`, computes SHA-256 digests,
 * writes a release manifest, and signs it with Ed25519.
 *
 * Environment:
 *   RELEASE_SIGNING_KEY — hex-encoded Ed25519 private key (DER/PKCS8)
 *   VERSION             — semver to embed (falls back to package.json)
 *   GITHUB_REPO         — owner/repo for download URLs (default: ronin-software/ok.lol)
 *   TUNNEL_HOST         — tunnel relay domain (default: w.ok.lol)
 *   TUNNEL_PORT         — tunnel relay SSH port (default: 2222)
 */

import { mkdir, readdir } from "node:fs/promises";
import { ed25519sign } from "./src/sign";

const TARGETS = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-arm64",
  "bun-linux-x64",
] as const;

/** Map bun target names to artifact suffixes. */
function suffix(target: string): string {
  return target.replace("bun-", "workerd-");
}

// –
// Configuration
// –

const pkg = await Bun.file(
  new URL("./package.json", import.meta.url),
).json();
const version = process.env.VERSION ?? pkg.version;
const repo = process.env.GITHUB_REPO ?? "ronin-software/ok.lol";
const signingKey = process.env.RELEASE_SIGNING_KEY;
const tunnelHost = process.env.TUNNEL_HOST ?? "w.ok.lol";
const tunnelPort = process.env.TUNNEL_PORT ?? "2222";

if (!signingKey) {
  console.error("RELEASE_SIGNING_KEY is required");
  process.exit(1);
}

const dist = new URL("./dist/", import.meta.url).pathname;
await mkdir(dist, { recursive: true });

// –
// Compile
// –

console.log(`building workerd v${version}`);

for (const target of TARGETS) {
  const name = suffix(target);
  const outpath = `${dist}${name}`;
  console.log(`  ${target} → ${name}`);

  const proc = Bun.spawn([
    "bun",
    "build",
    "--compile",
    "--target",
    target,
    "--define",
    `WORKERD_VERSION="${version}"`,
    "--define",
    `TUNNEL_HOST="${tunnelHost}"`,
    "--define",
    `TUNNEL_PORT="${tunnelPort}"`,
    "--outfile",
    outpath,
    new URL("./src/workerd.ts", import.meta.url).pathname,
  ], { stdout: "inherit", stderr: "inherit" });

  const code = await proc.exited;
  if (code !== 0) {
    console.error(`  FAIL ${target} (exit ${code})`);
    process.exit(1);
  }
}

// –
// Manifest
// –

const artifacts: Record<string, { sha256: string; url: string }> = {};
const tag = `worker-v${version}`;

const files = await readdir(dist);
for (const file of files.filter((f) => f.startsWith("workerd-"))) {
  const bytes = await Bun.file(`${dist}${file}`).arrayBuffer();
  const hash = new Bun.CryptoHasher("sha256")
    .update(new Uint8Array(bytes))
    .digest("hex");

  // Platform key: darwin-arm64, linux-x64, etc.
  const platform = file.replace("workerd-", "");
  artifacts[platform] = {
    sha256: hash,
    url: `https://github.com/${repo}/releases/download/${tag}/${file}`,
  };

  console.log(`  ${file} sha256=${hash.slice(0, 16)}…`);
}

const manifest = JSON.stringify({ artifacts, version }, null, 2);
await Bun.write(`${dist}release.json`, manifest);

// –
// Sign
// –

const signature = ed25519sign(
  new TextEncoder().encode(manifest),
  signingKey,
);
await Bun.write(`${dist}release.json.sig`, signature);

console.log(`\nrelease.json + release.json.sig written to dist/`);
console.log(`tag: ${tag}`);
