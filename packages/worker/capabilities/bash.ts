import { type Capability, zodToJsonSchema } from "@ok.lol/capability";
import z from "zod";

/** Args for calling the bash capability */
interface CallArgs {
  /** The command to execute */
  command: string;
}

/** Result of a bash capability call */
interface CallResult {
  /** Process exit code */
  exitCode: number;
  /** Standard error output */
  stderr: string;
  /** Standard output */
  stdout: string;
}

// –
// Schemas
// –

const inputSchema = z.object({
  command: z.string().describe('The bash command to execute'),
});

const outputSchema = z.object({
  exitCode: z.number().describe('Process exit code'),
  stderr: z.string().describe('Standard error output'),
  stdout: z.string().describe('Standard output'),
});

/** Runs bash commands on the host */
export const bash = {
  /** Returns whether bash is available */
  available: async () => Bun.which("bash") !== null,
  /** Runs a bash command */
  call: async ({ command }) => {
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
  /** No-op. Bash is either installed or it is not */
  setup: async () => {},

  description: "Runs bash commands on the host",
  name: "bash",

  inputSchema: zodToJsonSchema(inputSchema),
  outputSchema: zodToJsonSchema(outputSchema),
} satisfies Capability<void, CallArgs, CallResult>;
