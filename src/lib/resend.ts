/**
 * Resend client for transactional email.
 */

import { Resend } from "resend";
import { env } from "./env";

/** Shared Resend client. */
export const resend = new Resend(env.RESEND_API_KEY);

/** Sender address for transactional email (separate domain for reputation). */
function from() {
  return `ok.lol <noreply@${env.EMAIL_DOMAIN_TRANSACTIONAL}>`;
}

/** Send a magic sign-in link. */
export async function sendMagicLink(
  email: string,
  url: string,
): Promise<void> {
  const { error } = await resend.emails.send({
    from: from(),
    html: [
      `<p>Sign in to your ${env.EMAIL_DOMAIN} account:</p>`,
      `<p><a href="${url}">Sign in</a></p>`,
      "<p>This link expires in 10 minutes. If you didn't request this, ignore this email.</p>",
    ].join(""),
    subject: "Sign in to ok.lol",
    to: email,
  });

  if (error) {
    throw new Error(`Resend: ${error.message}`);
  }
}
