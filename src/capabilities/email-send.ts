import type { Capability } from "@ok.lol/capability";
import { env } from "@/lib/env";
import { Resend, type CreateEmailOptions } from "resend";
import type { OriginExecutionContext } from "./_execution-context";

// Resend SDK
const resend = new Resend(env.RESEND_API_KEY);

// Input Type
type Input = Omit<CreateEmailOptions, "from">;

/** Sends an email from the principal's `@ok.lol` address. */
const emailSend: Capability<OriginExecutionContext, Input, void> = {
  available: async () => true,
  async call(ectx, email) {
    const from = `${ectx.principal.username}@ok.lol`;
    // Cast needed: Omit over a discriminated union loses branch structure.
    await resend.emails.send({ ...email, from } as CreateEmailOptions);
  },
  description: "Sends an email from the principal's @ok.lol address",
  inputSchema: {},
  name: "email-send",
  outputSchema: {},
  setup: async () => {},
};

export default emailSend;
