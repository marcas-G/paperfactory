import { SkillLoader, type SkillDefinition } from "./loader";

export class SkillSystem {
  private skills: Map<string, SkillDefinition & { isToolAllowed: (tool: string) => boolean }> = new Map();
  private loader: SkillLoader;

  constructor() {
    this.loader = new SkillLoader();
  }

  async register(config: SkillDefinition): Promise<void> {
    const skill = await this.loader.loadFromYaml(config);
    this.skills.set(config.name, skill);
  }

  get(name: string): (SkillDefinition & { isToolAllowed: (tool: string) => boolean }) | undefined {
    return this.skills.get(name);
  }

  list(): Array<SkillDefinition & { isToolAllowed: (tool: string) => boolean }> {
    return Array.from(this.skills.values());
  }

  async loadFromDirectory(dir: string): Promise<void> {
    const { readdir, stat } = await import("fs/promises");
    const { join } = await import("path");

    const entries = await readdir(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const s = await stat(fullPath);
      if (s.isDirectory() && entry !== "node_modules") {
        const skillFile = join(fullPath, "SKILL.md");
        try {
          const skill = await this.loader.loadFromFile(skillFile);
          this.skills.set(skill.name, skill);
        } catch {
          // Skip directories without SKILL.md
        }
      } else if (entry.endsWith(".md")) {
        try {
          const skill = await this.loader.loadFromFile(fullPath);
          this.skills.set(skill.name, skill);
        } catch {
          // Skip files without proper frontmatter
        }
      }
    }
  }
}
