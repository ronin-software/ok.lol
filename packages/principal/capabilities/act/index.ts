import { type Capability, zodToJsonSchema } from "@ok.lol/capability";
import { z } from "zod";

export default {
  name: 'act',
  description: 'Process a message and take any necessary actions until completion.',

  async available() {
    // Always available on Principal
    return true;
  },

  async call({ message, streaming }) {
    // TODO: Run agent loop here
  },

  async setup() {
    // TODO: Setup proactivity interval, on fire:
    // - Generate proactivity prompt and act on it
  },

  inputSchema: zodToJsonSchema(z.any()),
  outputSchema: zodToJsonSchema(z.any()),
} satisfies Capability<any, any>; 