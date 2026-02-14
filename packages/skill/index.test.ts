import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { listSkills } from ".";

const FIXTURES = join(import.meta.dir, "fixtures");

describe("listSkills", () => {
  test("returns valid skills", async () => {
    const skills = await listSkills(FIXTURES);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(["cased-file", "valid-skill"]);
  });

  test("populates all fields", async () => {
    const skills = await listSkills(FIXTURES);
    const skill = skills.find((s) => s.name === "valid-skill")!;
    expect(skill.description).toBe("A valid test skill for unit testing.");
    expect(skill.license).toBe("MIT");
    expect(skill.metadata?.emoji).toBe("🧪");
    expect(skill.metadata?.providers).toEqual({ name: "bash" });
  });

  test("returns body content without frontmatter", async () => {
    const skills = await listSkills(FIXTURES);
    const skill = skills.find((s) => s.name === "valid-skill")!;
    const body = await skill.body();
    expect(body).toStartWith("# Valid Skill");
    expect(body).not.toContain("---");
  });

  test("finds SKILL.md with variant casing", async () => {
    const skills = await listSkills(FIXTURES);
    expect(skills.find((s) => s.name === "cased-file")).toBeDefined();
  });

  test("skips dirs missing required frontmatter fields", async () => {
    const skills = await listSkills(FIXTURES);
    expect(skills.find((s) => s.name === "missing-fields")).toBeUndefined();
  });

  test("skips empty dirs", async () => {
    const skills = await listSkills(FIXTURES);
    expect(skills.find((s) => s.name === "empty-dir")).toBeUndefined();
  });

  test("skips non-directory entries", async () => {
    const skills = await listSkills(FIXTURES);
    expect(skills.find((s) => s.name === "stray-file")).toBeUndefined();
  });

  test("throws for nonexistent path", async () => {
    expect(listSkills("/nonexistent")).rejects.toThrow();
  });
});
