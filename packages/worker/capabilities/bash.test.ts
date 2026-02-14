import { describe, expect, test } from "bun:test";
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
    expect(bash.inputSchema.type).toBe("object");
    expect(bash.inputSchema.properties).toEqual({ command: { description: "The bash command to execute", type: "string" } });
    expect(bash.inputSchema.required).toEqual(["command"]);
    // Note: Not asserted as thoroughly as inputSchema
    expect(bash.outputSchema.type).toBe("object");
  });
});
