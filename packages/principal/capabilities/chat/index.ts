import type { Capability } from "@ok.lol/capability";
import { fromZod } from "@ok.lol/jsonschema";
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

  inputSchema: fromZod(z.any()),
  outputSchema: fromZod(z.any()),
} satisfies Capability<any, any>; 