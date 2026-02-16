/**
 * Resend client for transactional email.
 */

import { Resend } from "resend";
import { env } from "./env";

/** Shared Resend client. */
export const resend = new Resend(env.RESEND_API_KEY);

/** Default sender address for transactional email. */
function from() {
  return `ok.lol <noreply@${env.EMAIL_DOMAIN}>`;
}

/** Send a password reset email with a one-time link. */
export async function sendResetEmail(
  email: string,
  resetUrl: string,
): Promise<void> {
  const { error } = await resend.emails.send({
    from: from(),
    html: [
      `<p>A password reset was requested for your ${env.EMAIL_DOMAIN} account.</p>`,
      `<p><a href="${resetUrl}">Reset your password</a></p>`,
      "<p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>",
    ].join(""),
    subject: "Reset your password",
    to: email,
  });

  if (error) {
    throw new Error(`Resend: ${error.message}`);
  }
}
