import type { Capability } from "@ok.lol/capability";
import { z } from "zod";

// –
// Schemas
// –

const inputSchema = z.object({
  command: z.string().describe("The bash command to execute"),
});

const outputSchema = z.object({
  exitCode: z.number().describe("Process exit code"),
  stderr: z.string().describe("Standard error output"),
  stdout: z.string().describe("Standard output"),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

/** Runs bash commands on the host. */
export const bash: Capability<void, Input, Output> = {
  available: async () => Bun.which("bash") !== null,
  async call({ command }) {
    const proc = Bun.spawn(["bash", "-c", command], {
      stderr: "pipe",
      stdout: "pipe",
    });
    const [exitCode, stderr, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
      new Response(proc.stdout).text(),
    ]);
    return { exitCode, stderr, stdout };
  },
  setup: async () => {},

  description: "Runs bash commands on the host",
  name: "bash",

  inputSchema,
  outputSchema,
};
