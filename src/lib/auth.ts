/**
 * Magic-link authentication.
 *
 * A signed JWT is emailed to the user. Clicking the link verifies
 * the token and establishes a session. No passwords stored.
 */

import { SignJWT, jwtVerify } from "jose";
import { secret } from "./session";

/** Magic link tokens expire after 10 minutes. */
const EXPIRY = "10m";

/** Platform the sign-in was initiated from. */
export type Platform = "mobile";

/** Verified magic-link payload. */
export interface MagicToken {
  /** User's email address. */
  email: string;
  /** Originating platform. Absent for web. */
  from?: Platform;
}

/** Create a signed magic-link token for an email address. */
export async function createToken(
  email: string,
  from?: Platform,
): Promise<string> {
  const jwt = new SignJWT({
    purpose: "magic",
    ...(from && { from }),
  })
    .setSubject(email)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY);

  return jwt.sign(secret());
}

/** Verify a magic-link token. Returns the payload, or null if invalid/expired. */
export async function verifyToken(token: string): Promise<MagicToken | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "magic") return null;
    if (typeof payload.sub !== "string") return null;
    return {
      email: payload.sub,
      from: payload.from === "mobile" ? "mobile" : undefined,
    };
  } catch {
    return null;
  }
}
