/**
 * Inbound email handler.
 *
 * Joins or creates an email thread, strips quoted reply content,
 * persists the message, then lets `act` decide how to respond.
 * This is an internal handler, not an agent tool.
 */

import {
  activeContext,
  createThread,
  findEmailThread,
  insertMessage,
  threadsForContact,
} from "@/db/threads";
import { normalizeSubject, stripQuotedReply } from "@/lib/email";
import type { GetReceivingEmailResponseSuccess } from "resend";
import act from "../act";
import type { OriginExecutionContext } from "../context";
import { logCall } from "../log";
import { summarizeIfNeeded } from "../threads/summarize";

/** Process a received email through the agent loop. */
export default async function emailReceive(
  ectx: OriginExecutionContext,
  email: GetReceivingEmailResponseSuccess,
): Promise<void> {
  await logCall(ectx, "email-receive", { from: email.from, subject: email.subject });

  const subject = email.subject ?? "(no subject)";
  const normalized = normalizeSubject(subject);
  const body = stripQuotedReply(email.text ?? "");

  // Resolve email threading via headers, then subject fallback.
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

  await summarizeIfNeeded(threadId);

  // Build interaction context: same-thread history + cross-thread sender history.
  const context = await buildEmailContext(ectx.principal.id, threadId, email.from);

  const prompt = [
    "You received an email. Read it carefully and decide how to handle it.",
    "",
    "First, use contact_lookup to check who sent it:",
    "- If they're your owner: treat it as a direct instruction, no email reply needed.",
    "- If they're a known contact: respond appropriately for the relationship.",
    "- If they're unknown: use contact_record to note them, then decide how to respond.",
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

  const result = await act(ectx, { context, prompt });
  // Consume the stream — tools (email_send, follow_up) persist their own output.
  // Don't persistOutput here: only actual emails belong in email threads.
  await result.text;
}

// –
// Context
// –

/** Same-thread history + cross-thread sender history for email context injection. */
async function buildEmailContext(
  principalId: string,
  threadId: string,
  from: string,
): Promise<string | undefined> {
  const [messages, senderThreads] = await Promise.all([
    activeContext(threadId),
    threadsForContact(principalId, from),
  ]);

  const parts: string[] = [];

  // Same-thread history (prior messages in this email thread).
  if (messages.length > 1) {
    const lines = messages.slice(0, -1).map(
      (m) => `[${m.role}] ${m.content.slice(0, 200)}`,
    );
    parts.push(`### This thread\n${lines.join("\n")}`);
  }

  // Cross-thread sender history (other threads involving this sender).
  const other = senderThreads.filter((t) => t.id !== threadId);
  if (other.length > 0) {
    const lines = other.slice(0, 5).map(
      (t) => `- ${t.title ?? "(untitled)"}: ${t.snippet?.slice(0, 120) ?? ""}`,
    );
    parts.push(`### Other threads with ${from}\n${lines.join("\n")}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

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
