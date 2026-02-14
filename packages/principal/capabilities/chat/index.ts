import { type Capability, zodToJsonSchema } from "@ok.lol/capability";
import { z } from "zod";

export default {
  name: 'chat',
  description: 'Receive chat messages sent to this Principal, act and reply- all at once -or via streaming.',

  async available() {
    // Always available on Principal
    return true;
  },

  async call(message) {
  },

  async setup() {
  },

  inputSchema: zodToJsonSchema(z.any()),
  outputSchema: zodToJsonSchema(z.any()),
} satisfies Capability<any, any>; 