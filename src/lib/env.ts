/**
 * Validated environment variables.
 *
 * Getters assert at point-of-use, so a missing var is caught
 * immediately rather than silently producing undefined.
 * `validate()` eagerly checks all at startup.
 */

import { assert } from "./assert";

/** Read and validate a required environment variable. */
function required(key: string): string {
  const value = process.env[key];
  assert(value, `Missing required environment variable: ${key}`);
  return value;
}

/** Validated environment accessors. Asserts on every read. */
export const env = {
  /** Vercel AI Gateway API key. */
  get AI_GATEWAY_API_KEY() {
    return required("AI_GATEWAY_API_KEY");
  },
  /** Public-facing origin. */
  get BASE_URL() {
    return (
      process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001"
    ).replace(/\/$/, "");
  },
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  /** Principal address domain (username@ok.lol). */
  get EMAIL_DOMAIN() {
    return required("EMAIL_DOMAIN");
  },
  /** Transactional email domain (sign-in links, etc.). Separate for reputation. */
  get EMAIL_DOMAIN_TRANSACTIONAL() {
    return required("EMAIL_DOMAIN_TRANSACTIONAL");
  },
  /** Custom URL scheme for native app deep links. */
  get MOBILE_SCHEME() {
    return required("MOBILE_SCHEME");
  },
  get RESEND_API_KEY() {
    return required("RESEND_API_KEY");
  },
  get RESEND_WEBHOOK_SECRET() {
    return required("RESEND_WEBHOOK_SECRET");
  },
  get SESSION_SECRET() {
    return required("SESSION_SECRET");
  },
  get STRIPE_SECRET_KEY() {
    return required("STRIPE_SECRET_KEY");
  },
  get STRIPE_WEBHOOK_SECRET() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
};

/** Eagerly validate all required vars. Called once at startup. */
export function validate() {
  env.DATABASE_URL;
  env.EMAIL_DOMAIN;
  env.EMAIL_DOMAIN_TRANSACTIONAL;
  env.MOBILE_SCHEME;
  env.RESEND_API_KEY;
  env.RESEND_WEBHOOK_SECRET;
  env.SESSION_SECRET;
  env.STRIPE_SECRET_KEY;
  env.STRIPE_WEBHOOK_SECRET;
}
