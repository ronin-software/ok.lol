/**
 * Email-based authentication utilities.
 *
 * Password hashing uses Argon2id via Bun's built-in `Bun.password`.
 * Session identification delegates to the JWT session cookie.
 */

import { verify } from "./session";

// –
// Password
// –

/** Hash a password with Argon2id. */
export function hash(password: string): Promise<string> {
  return Bun.password.hash(password, "argon2id");
}

/** Verify a password against an Argon2id hash. */
export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return Bun.password.verify(password, passwordHash);
}

// –
// Identify
// –

/**
 * Identify the caller from the session cookie.
 * Returns the account ID, or `undefined` if unauthenticated.
 */
export async function identify(): Promise<string | undefined> {
  return verify();
}
