import type { Capability } from "@ok.lol/capability";
import type { GetReceivingEmailResponseSuccess } from "resend";
import { z } from "zod";
import type { OriginExecutionContext } from "../_execution-context";
import { logCall } from "../_log";
import { summarizeIfNeeded } from "../threads/summarize";
import act from "../act";
import { normalizeSubject, stripQuotedReply } from "@/lib/email";
import { createThread, findEmailThread, insertMessage } from "@/db/threads";

/**
 * Processes a received email by delegating to the agent loop.
 *
 * Joins or creates an email thread, strips quoted reply content,
 * persists the message, then lets `act` decide how to respond.
 */
const emailReceive: Capability<OriginExecutionContext, GetReceivingEmailResponseSuccess, void> = {
  available: async () => true,

  async call(ectx, email) {
    await logCall(ectx, "email-receive", { from: email.from, subject: email.subject });

    const subject = email.subject ?? "(no subject)";
    const normalized = normalizeSubject(subject);
    const body = stripQuotedReply(email.text ?? "");

    // Resolve email threading via headers, then subject fallback.
    // Resend's type lacks index signature; extract fields explicitly.
    const references = parseReferences(email);
    let threadId = await findEmailThread(ectx.principal.id, references, normalized);

    if (!threadId) {
      threadId = await createThread(ectx.principal.id, "email", normalized);
    }

    // Persist the inbound email as a message.
    await insertMessage({
      content: body || "(no body)",
      metadata: {
        cc: email.cc,
        from: email.from,
        messageId: prop(email, "message_id"),
        subject,
        to: email.to,
      },
      role: "user",
      threadId,
    });

    // Summarize if the thread context is getting large.
    await summarizeIfNeeded(threadId);

    const prompt = [
      "You received an email. Read it carefully and decide how to handle it.",
      "",
      "First, use lookup_contact to check who sent it:",
      "- If they're your owner: treat it as a direct instruction, no email reply needed.",
      "- If they're a known contact: respond appropriately for the relationship.",
      "- If they're unknown: use record_contact to note them, then decide how to respond.",
      "",
      "To notify your owner of something, prefer follow_up over email — search your threads first.",
      "If you can identify a thread where they asked you to do something related to this email",
      "(e.g. 'email X and let me know when they reply'), use follow_up to post there.",
      "Only fall back to emailing your owner if no relevant thread exists.",
      "",
      "If the email is from someone other than your owner and warrants a reply, reply to them directly.",
      "",
      `From: ${email.from}`,
      `Subject: ${subject}`,
      "",
      body || "(no body)",
    ].join("\n");

    const result = await act(ectx, { prompt, threadId });

    // Consume the stream to ensure completion and usage recording.
    const text = await result.text;

    // Persist the assistant's response.
    if (text.length > 0) {
      await insertMessage({
        content: text,
        role: "assistant",
        threadId,
      });
    }
  },

  description: "Processes a received email via the agent loop",
  name: "email-receive",

  inputSchema: z.any(),
  outputSchema: z.void(),
  setup: async () => {},
};

export default emailReceive;

// –
// Helpers
// –

/** Safe property access on Resend's typed-but-extensible email object. */
function prop(email: GetReceivingEmailResponseSuccess, key: string): unknown {
  return (email as unknown as Record<string, unknown>)[key];
}

/** Extract message-id references from Resend's email object. */
function parseReferences(email: GetReceivingEmailResponseSuccess): string[] {
  const refs: string[] = [];

  const inReplyTo = prop(email, "in_reply_to");
  if (typeof inReplyTo === "string" && inReplyTo.length > 0) {
    refs.push(inReplyTo);
  }

  const references = prop(email, "references");
  if (typeof references === "string" && references.length > 0) {
    refs.push(...references.split(/\s+/));
  }

  return refs;
}
