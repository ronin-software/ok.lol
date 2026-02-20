/**
 * Inbound email handler.
 *
 * Joins or creates an email thread, strips quoted reply content,
 * persists the message, then lets `act` decide how to respond.
 * This is an internal handler, not an agent tool.
 *
 * Access control: resolves the sender to a contact and sets
 * the interaction context before invoking the agent loop.
 */

import {
  activeContext,
  createThread,
  findEmailThread,
  insertMessage,
  threadsForContact,
} from "@/db/threads";
import { loadContactFrontmatter, resolveContact } from "@/lib/access";
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
    threadId = await createThread(ectx.principal.id, normalized);
  }

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

  // Resolve sender to a contact for access control.
  const senderContact = await resolveContact(ectx.principal.id, email.from);
  const isOwner = email.from === ectx.principal.ownerEmail;
  const contact = senderContact ?? {
    identifier: email.from,
    isOwner,
    tags: [],
  };
  const contactFm = senderContact
    ? await loadContactFrontmatter(ectx.principal.id, senderContact)
    : {};

  // Narrowed execution context for this email interaction.
  const emailEctx: OriginExecutionContext = { ...ectx, contact, contactFm };

  const context = await buildEmailContext(ectx.principal.id, threadId, email.from);

  const prompt = [
    "You received an email. Read it carefully and decide how to handle it.",
    "",
    "First, check who sent it:",
    `- Compare \`${email.from}\` against the owner email in your context.`,
    "- Use document_read to check for a contact doc at `contacts/{identifier}.md`.",
    "- If they're your owner: treat it as a direct instruction.",
    "- If they're unknown: use document_write to create a contact doc for them.",
    "",
    "To notify your owner, prefer posting in an existing thread (use `send` with a threadId).",
    "Only fall back to emailing your owner if no relevant thread exists.",
    "",
    "If the email is from someone other than your owner and warrants a reply, reply directly.",
    "",
    `From: ${email.from}`,
    `Subject: ${subject}`,
    "",
    body || "(no body)",
  ].join("\n");

  const result = await act(emailEctx, { context, prompt });
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

  if (messages.length > 1) {
    const lines = messages.slice(0, -1).map(
      (m) => `[${m.role}] ${m.content.slice(0, 200)}`,
    );
    parts.push(`### This thread\n${lines.join("\n")}`);
  }

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
