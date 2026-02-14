import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

/** Given a `skillsDir` path, returns all valid skills within */
export async function listSkills(skillsDir: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  const entries = await readdir(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dir = join(skillsDir, entry.name);
    const filename = await findSkillFile(dir);
    if (!filename) continue;

    const text = await Bun.file(join(dir, filename)).text();
    const { frontmatter, body } = parseSkillFile(text);
    const result = FrontmatterSchema.safeParse(frontmatter);
    if (!result.success) continue;

    skills.push({ ...result.data, body: async () => body });
  }

  return skills;
}

// –
// Parsing
// –

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

/** Case-insensitive search for `SKILL.md` in a directory */
async function findSkillFile(dir: string): Promise<string | undefined> {
  const entries = await readdir(dir);
  return entries.find((e) => e.toLowerCase() === "skill.md");
}

/** Split a SKILL.md into parsed frontmatter and body content */
function parseSkillFile(content: string): {
  body: string;
  frontmatter: unknown;
} {
  const match = content.match(FRONTMATTER_RE);
  const frontmatter = match?.[1] ? Bun.YAML.parse(match[1]) : {};
  const body = match ? content.slice(match[0].length).trimStart() : content;
  return { body, frontmatter };
}

// –
// Schemas
// –

/** Arbitrary metadata with optional vendor extension */
export type SkillMetadata = z.infer<typeof MetadataSchema>;

const MetadataSchema = z
  .object({
    capabilities: z
      .string()
      .array()
      .optional()
      .describe("Names of capabilities the skill depends on"),
  })
  .catchall(z.unknown());

/** Parsed skill with frontmatter and lazy body loader */
export type Skill = z.infer<typeof FrontmatterSchema> & {
  /** Returns the post-frontmatter body content */
  body: () => Promise<string>;
};

/** SKILL.md YAML frontmatter. [Spec](https://agentskills.io/specification) */
const FrontmatterSchema = z
  .object({
    /** Allowed tools config */
    "allowed-tools": z.string().optional(),
    /** Compatibility info */
    compatibility: z.string().optional(),
    /** Skill description */
    description: z.string().min(1),
    /** License string */
    license: z.string().optional(),
    /** Arbitrary metadata */
    metadata: MetadataSchema.optional(),
    /** Skill name */
    name: z.string().min(1),
  })
  .transform(({ "allowed-tools": allowedTools, ...rest }) => ({
    allowedTools,
    ...rest,
  }));
