import type { Capability } from "@ok.lol/capability";
import { fromZod } from "@ok.lol/jsonschema";
import { z } from "zod";

export default {
  name: 'email-receive',
  description: 'Receives emails addressed to this Principal via its @ok.lol address.',

  async available() {
    // Always available on Principal
    return true;
  },

  async call(email) {
    // TODO: Receive email
    // TODO: Store it in messages
    // TODO: Call `act` with email
  },

  async setup() {
    // TODO: Hook into Origin hook for email-receive
    // NOTE: Origin will need to implement a hook to handle received emails, replaying them to the correct server for the Principal if received by wrong host
  },

  inputSchema: fromZod(z.any()),
  outputSchema: fromZod(z.any()),
} satisfies Capability<any, any>; 