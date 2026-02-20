/**
 * Unified send capability — post a message to a thread, optionally
 * delivering via email. Replaces both `email_send` and `follow_up`.
 */

import { createThread, findEmailThread, getThreadMeta, insertMessage } from "@/db/threads";
import { assert } from "@/lib/assert";
import { recordUsage } from "@/lib/billing";
import { normalizeSubject } from "@/lib/email";
import { env } from "@/lib/env";
import { computeCost } from "@/lib/pricing";
import type { Capability } from "@ok.lol/capability";
import { Resend, type CreateEmailOptions } from "resend";
import { z } from "zod";
import type { OriginExecutionContext } from "./context";

const resend = new Resend(env.RESEND_API_KEY);

// –
// Schema
// –

const inputSchema = z.object({
  attachments: z.array(z.object({
    content: z.string().optional().describe("Base64 encoded content"),
    filename: z.string().optional().describe("Attachment filename"),
    path: z.string().optional().describe("Path to file"),
  })).optional().describe("Email attachments"),
  cc: z.union([z.email(), z.array(z.email())]).optional().describe("CC recipient(s)"),
  content: z.string().min(1).describe("Message body"),
  subject: z.string().optional().describe("Subject line (used for email or new thread title)"),
  threadId: z.uuid().optional().describe("Thread to post in. Omit to start a new thread"),
  to: z.union([z.email(), z.literal("owner")]).optional().describe("Email recipient. Omit for chat-only post"),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  threadId: z.string(),
});

type Output = z.infer<typeof outputSchema>;

// –
// Capability
// –

const send: Capability<OriginExecutionContext, Input, Output> = {
  async call(ectx, input) {
    let threadId = input.threadId;

    // Resolve or create thread.
    if (!threadId) {
      const title = input.subject
        ? normalizeSubject(input.subject)
        : undefined;
      threadId = await createThread(ectx.principal.id, title);
    } else {
      // Verify ownership.
      const meta = await getThreadMeta(threadId, ectx.principal.id);
      assert(meta != null, `Thread not found or not owned: ${threadId}`);
    }

    // Resolve email delivery.
    const toAddress = input.to === "owner"
      ? ectx.principal.ownerEmail
      : input.to;

    const isEmail = !!toAddress;
    const from = `${ectx.principal.name} <${ectx.principal.username}@${env.EMAIL_DOMAIN}>`;

    let messageId: string | undefined;
    if (isEmail) {
      assert(toAddress, "Recipient address required for email delivery");

      const { attachments, cc, content: text, subject } = input;
      const { data } = await resend.emails.send({
        ...(attachments ? { attachments } : {}),
        ...(cc ? { cc } : {}),
        from,
        subject: subject ?? "(no subject)",
        text,
        to: toAddress,
      } as CreateEmailOptions);

      messageId = data?.id;

      await recordUsage({
        accountId: ectx.principal.accountId,
        amount: 1n,
        cost: computeCost("resend:send", 1n),
        hireId: ectx.caller?.hireId,
        resource: "resend:send",
      });
    }

    // Persist the message.
    const metadata = isEmail
      ? { cc: input.cc, from, messageId, subject: input.subject, to: toAddress }
      : null;

    await insertMessage({
      content: input.content,
      metadata,
      role: "assistant",
      threadId,
    });

    return { threadId };
  },

  description: "Post a message in a thread, optionally delivering via email",
  name: "send",

  inputSchema,
  outputSchema,
};

export default send;
