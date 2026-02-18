import { insertMessage } from "@/db/threads";
import { env } from "@/lib/env";
import type { Capability } from "@ok.lol/capability";
import { Resend, type CreateEmailOptions } from "resend";
import { z } from "zod";
import type { OriginExecutionContext } from "../context";

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
  /** Thread to persist this email in. Omit for fire-and-forget sends. */
  threadId: z.uuid().optional().describe("Thread ID to persist this email in"),
  to: z.email().describe("Recipient email address"),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.void();

/** Sends an email from the principal's address and persists it in the thread. */
const emailSend: Capability<OriginExecutionContext, Input, void> = {
  async call(ectx, email) {
    const from = `${ectx.principal.name} <${ectx.principal.username}@${env.EMAIL_DOMAIN}>`;

    // Strip threadId before passing to Resend (not a Resend field).
    const { threadId, ...sendPayload } = email;

    // Cast needed: Omit over a discriminated union loses branch structure.
    const { data } = await resend.emails.send({ ...sendPayload, from } as CreateEmailOptions);

    // Persist the outbound email in the thread.
    if (threadId) {
      await insertMessage({
        content: email.text,
        metadata: {
          cc: email.cc,
          from,
          messageId: data?.id,
          subject: email.subject,
          to: email.to,
        },
        role: "assistant",
        threadId,
      });
    }
  },

  description: `Sends an email from the principal's @${env.EMAIL_DOMAIN} address`,
  name: "send_email",

  inputSchema,
  outputSchema,
};

export default emailSend;
