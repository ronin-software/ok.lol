import type { Capability } from "@ok.lol/capability";
import { env } from "@/lib/env";
import { generateText } from "ai";
import { Resend, type GetReceivingEmailResponseSuccess } from "resend";
import type { OriginExecutionContext } from "./_execution-context";
import emailSend from "./email-send";

// Resend SDK
export const resend = new Resend(env.RESEND_API_KEY);

/** Processes a received email and generates a reply using the principal's documents as context. */
const emailReceive: Capability<OriginExecutionContext, GetReceivingEmailResponseSuccess, void> = {
  available: async () => true,
  async call(ectx, email) {
    // Assemble system prompt from documents
    const systemParts = ectx.principal.documents.map(
      (doc) => `## ${doc.path}\n${doc.contents}`,
    );
    const system = [
      ...systemParts,
      `Your prompts are emails. For each prompt, output a reply.`,
      `Incoming email:`,
      `  - Subject: "${email.subject}"`,
      `  - From: "${email.from}"`,
    ].join("\n\n");

    // Generate response
    const response = await generateText({
      model: "anthropic/claude-sonnet-4.5",
      prompt: email.text ?? "(no body)",
      system,
    });

    // Send reply
    await emailSend.call(ectx, {
      subject: email.subject,
      text: response.text,
      to: email.from,
    });
  },
  description: "Processes a received email and generates a reply",
  inputSchema: {},
  name: "email-receive",
  outputSchema: {},
  setup: async () => {},
};

export default emailReceive;
