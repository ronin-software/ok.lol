/**
 * Email-based authentication utilities.
 *
 * Password hashing uses Argon2id via Bun's built-in `Bun.password`.
 */

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
