import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { bash } from "./bash";

describe("bash", () => {
  test("is available", async () => {
    expect(await bash.available()).toBe(true);
  });

  test("setup is a no-op", async () => {
    await bash.setup();
  });

  test("runs a command", async () => {
    const result = await bash.call({ command: "echo hello" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello\n");
    expect(result.stderr).toBe("");
  });

  test("captures stderr", async () => {
    const result = await bash.call({ command: "echo err >&2" });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("err\n");
    expect(result.stdout).toBe("");
  });

  test("returns non-zero exit codes", async () => {
    const result = await bash.call({ command: "exit 42" });
    expect(result.exitCode).toBe(42);
  });

  test("exposes valid schemas", () => {
    // Schemas are zod types; verify via JSON schema conversion.
    const input = z.toJSONSchema(bash.inputSchema);
    expect(input.type).toBe("object");
    expect(input.properties).toHaveProperty("command");
    expect(input.required).toEqual(["command"]);

    const output = z.toJSONSchema(bash.outputSchema);
    expect(output.type).toBe("object");
  });
});
