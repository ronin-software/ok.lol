import { env } from "@/lib/env";
import type { Capability } from "@ok.lol/capability";
import { Resend, type CreateEmailOptions } from "resend";
import { z } from "zod";
import type { OriginExecutionContext } from "../_execution-context";
import { logCall } from "../_log";

// Resend SDK
const resend = new Resend(env.RESEND_API_KEY);

// –
// Schemas
// –

const inputSchema = z.object({
  attachments: z.array(z.object({
    content: z.string().optional().describe("Base64 encoded content"),
    filename: z.string().optional().describe("Attachment filename"),
    path: z.string().optional().describe("Path to file"),
  })).optional().describe("Email attachments"),
  cc: z.union([z.email(), z.array(z.email())]).optional().describe("CC recipient(s)"),
  subject: z.string().describe("Email subject line"),
  text: z.string().describe("Plain text email body"),
  to: z.email().describe("Recipient email address"),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.void();

/** Sends an email from the principal's address. */
const emailSend: Capability<OriginExecutionContext, Input, void> = {
  available: async () => true,
  async call(ectx, email) {
    await logCall(ectx, "email-send", email);
    const from = `${ectx.principal.name} <${ectx.principal.username}@${env.EMAIL_DOMAIN}>`;
    // Cast needed: Omit over a discriminated union loses branch structure.
    await resend.emails.send({ ...email, from } as CreateEmailOptions);
  },
  setup: async () => {},

  description: `Sends an email from the principal's @${env.EMAIL_DOMAIN} address`,
  name: "send_email",

  inputSchema,
  outputSchema,
};

export default emailSend;
