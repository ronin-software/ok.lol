/**
 * HMAC-SHA256 request signing.
 *
 * The origin signs outbound request bodies and the worker verifies them.
 * Both sides share a 256-bit hex-encoded secret.
 *
 * Wire format: `X-Signature-256: sha256=<hex-encoded HMAC>`
 */

/** Header carrying the signature. */
export const HEADER = "x-signature-256";

/** Generate a random 256-bit signing secret (hex-encoded). */
export function generate(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

/** Sign a request body, returning the full header value. */
export async function sign(body: string, secret: string): Promise<string> {
  const key = await importKey(secret, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encode(body));
  return `sha256=${hex(new Uint8Array(sig))}`;
}

/** Verify a signature header against a request body. Timing-safe. */
export async function verify(
  body: string,
  header: string,
  secret: string,
): Promise<boolean> {
  if (!header.startsWith("sha256=")) return false;
  const key = await importKey(secret, ["verify"]);
  return crypto.subtle.verify(
    "HMAC",
    key,
    unhex(header.slice(7)),
    encode(body),
  );
}

// –
// Encoding
// –

const encoder = new TextEncoder();

function encode(s: string) {
  return encoder.encode(s);
}

function hex(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function importKey(secret: string, usages: KeyUsage[]) {
  return crypto.subtle.importKey(
    "raw",
    unhex(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

function unhex(h: string) {
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
