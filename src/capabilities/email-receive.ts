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
      "You received an email. Read it carefully and reply appropriately.",
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
