import { findOwnerContact } from "@/db/contacts";
import { createThread, findEmailThread, insertMessage } from "@/db/threads";
import { assert } from "@/lib/assert";
import { env } from "@/lib/env";
import { normalizeSubject } from "@/lib/email";
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
  /** Recipient email address, or "owner" to send to the account holder. */
  to: z.union([z.email(), z.literal("owner")]).describe('Recipient email address, or "owner" to send to the account holder'),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.void();

/** Sends an email from the principal's address and persists it in the thread. */
const emailSend: Capability<OriginExecutionContext, Input, void> = {
  async call(ectx, email) {
    const from = `${ectx.principal.name} <${ectx.principal.username}@${env.EMAIL_DOMAIN}>`;

    // Resolve "owner" sentinel to the account holder's actual address.
    const toAddress = email.to === "owner"
      ? await resolveOwnerEmail(ectx.principal.id)
      : email.to;

    // Strip non-Resend fields before sending.
    const { threadId, to: _to, ...rest } = email;
    const { data } = await resend.emails.send({ ...rest, from, to: toAddress } as CreateEmailOptions);

    const meta = {
      cc: email.cc,
      from,
      messageId: data?.id,
      subject: email.subject,
      to: toAddress,
    };

    // Always persist in an email thread so the reply lands in the same thread
    // and the full conversation is visible from the contact page.
    const normalized = normalizeSubject(email.subject);
    let emailThreadId = await findEmailThread(ectx.principal.id, [], normalized);
    if (!emailThreadId) {
      emailThreadId = await createThread(ectx.principal.id, "email", normalized);
    }
    await insertMessage({ content: email.text, metadata: meta, role: "assistant", threadId: emailThreadId });

    // Also persist in the originating chat thread for context.
    if (threadId && threadId !== emailThreadId) {
      await insertMessage({ content: email.text, metadata: meta, role: "assistant", threadId });
    }
  },

  description: `Sends an email from the principal's @${env.EMAIL_DOMAIN} address`,
  name: "email_send",

  inputSchema,
  outputSchema,
};

export default emailSend;

// –
// Helpers
// –

/** Resolves the principal's owner contact to an email address. */
async function resolveOwnerEmail(principalId: string): Promise<string> {
  const owner = await findOwnerContact(principalId);
  assert(owner?.email != null, "Owner contact email not set — cannot send to owner");
  return owner.email;
}
