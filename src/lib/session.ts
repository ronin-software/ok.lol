/**
 * Stateless JWT session cookie.
 *
 * Uses HS256 with SESSION_SECRET. The JWT payload contains only
 * `sub` (account ID). No DB session table needed.
 */

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

/** Cookie name. */
const COOKIE = "session";

/** 30 days in seconds. */
const MAX_AGE = 30 * 24 * 60 * 60;

/** Only require Secure in production (HTTPS). */
const SECURE = process.env.NODE_ENV === "production";

/** HMAC secret derived from env. Shared with reset tokens. */
export function secret(): Uint8Array {
  return new TextEncoder().encode(env.SESSION_SECRET);
}

/** Create a Set-Cookie header value for a new session. */
export async function create(accountId: string): Promise<string> {
  const token = await new SignJWT({ sub: accountId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const parts = [
    `${COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${MAX_AGE}`,
  ];
  if (SECURE) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Read and verify the session cookie.
 * Returns the account ID, or `undefined` if absent/invalid.
 * Safe to call from server components and API routes.
 */
export async function verify(): Promise<string | undefined> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return undefined;

  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub;
  } catch {
    return undefined;
  }
}

/** Set-Cookie header value that expires the session. */
export function clear(): string {
  const parts = [
    `${COOKIE}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ];
  if (SECURE) parts.push("Secure");
  return parts.join("; ");
}
