/**
 * Ed25519 release signing.
 *
 * The build pipeline signs release manifests with a private key.
 * The worker daemon verifies them with the embedded public key.
 *
 * Keys and signatures are hex-encoded on the wire.
 */

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

/** Hex-encoded Ed25519 keypair. */
export interface Keypair {
  privateKey: string;
  publicKey: string;
}

/** Generate an Ed25519 keypair. One-time use for initial setup. */
export function generate(): Keypair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey: hex(privateKey.export({ format: "der", type: "pkcs8" })),
    publicKey: hex(publicKey.export({ format: "der", type: "spki" })),
  };
}

/** Sign arbitrary bytes with a hex-encoded Ed25519 private key (DER/PKCS8). */
export function ed25519sign(data: Uint8Array, privateKeyHex: string): string {
  const key = createPrivateKey({
    format: "der",
    key: unhex(privateKeyHex),
    type: "pkcs8",
  });
  return hex(sign(null, data, key));
}

/** Verify a hex-encoded Ed25519 signature against a hex-encoded public key (DER/SPKI). */
export function ed25519verify(
  data: Uint8Array,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  const key = createPublicKey({
    format: "der",
    key: unhex(publicKeyHex),
    type: "spki",
  });
  return verify(null, data, key, unhex(signatureHex));
}

// –
// Encoding
// –

function hex(bytes: Buffer | Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function unhex(h: string): Buffer {
  return Buffer.from(h, "hex");
}
