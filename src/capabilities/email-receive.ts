import type { Capability } from "@ok.lol/capability";
import type { GetReceivingEmailResponseSuccess } from "resend";
import type { OriginExecutionContext } from "./_execution-context";
import act from "./act";

/**
 * Processes a received email by delegating to the agent loop.
 *
 * Formats the email into a prompt and lets `act` decide how to respond.
 * The agent uses `send_email` to reply — it decides whether and how to
 * respond rather than a hardcoded pipeline.
 */
const emailReceive: Capability<OriginExecutionContext, GetReceivingEmailResponseSuccess, void> = {
  available: async () => true,

  async call(ectx, email) {
    const prompt = [
      "You received an email. Read it carefully and reply appropriately if needed. If the email is spam, email me (danscan@ronindevs.com) and let me know. If you take an action on a a received email (other than spam), reply back let the sender know. Be mindful of whether the email was sent by me or someone else. You can email me to let me know when you receive an email and it warrants my attention, and you can reply to conversational emails sent by others.",
      "",
      `From: ${email.from}`,
      `Subject: ${email.subject}`,
      "",
      email.text ?? "(no body)",
    ].join("\n");

    await act.call(ectx, { prompt });
  },

  description: "Processes a received email via the agent loop",
  inputSchema: {},
  name: "email-receive",
  outputSchema: {},
  setup: async () => {},
};

export default emailReceive;
