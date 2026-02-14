import type { Capability } from "@ok.lol/capability";
import { fromZod } from "@ok.lol/jsonschema";
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

  inputSchema: fromZod(z.any()),
  outputSchema: fromZod(z.any()),
} satisfies Capability<any, any>; 