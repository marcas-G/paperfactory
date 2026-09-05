import { readFile, access } from "fs/promises";
import { join } from "path";

export interface SkillDefinition {
  name: string;
  description: string;
  allowedTools: string[];
  cognitiveMode: string;
  maxIterations: number;
}

export class SkillLoader {
  async loadFromYaml(config: SkillDefinition) {
    return {
      ...config,
      isToolAllowed: (toolName: string) => config.allowedTools.includes(toolName),
    };
  }

  async loadFromFile(filePath: string) {
    const content = await readFile(filePath, "utf8");
    const frontmatter = content.match(/---\n([\s\S]*?)\n---/);
    if (!frontmatter) {
      throw new Error(`No frontmatter found in ${filePath}`);
    }

    const yaml = frontmatter[1];
    const config: SkillDefinition = {
      name: this.parseYamlValue(yaml, "name") || "",
      description: this.parseYamlValue(yaml, "description") || "",
      allowedTools: this.parseYamlArray(yaml, "allowed-tools") || this.parseYamlArray(yaml, "allowedTools") || [],
      cognitiveMode: this.parseYamlValue(yaml, "cognitive-mode") || this.parseYamlValue(yaml, "cognitiveMode") || "EXPLORE",
      maxIterations: parseInt(this.parseYamlValue(yaml, "max-iterations") || this.parseYamlValue(yaml, "maxIterations") || "20"),
    };

    return {
      ...config,
      isToolAllowed: (toolName: string) => config.allowedTools.includes(toolName),
    };
  }

  toPromptContext(skill: { name: string; description: string; allowedTools: string[]; cognitiveMode: string; maxIterations: number }): string {
    return `SKILL: ${skill.name}
Description: ${skill.description}
Allowed Tools: ${skill.allowedTools.join(", ")}
Cognitive Mode: ${skill.cognitiveMode}
Max Iterations: ${skill.maxIterations}`;
  }

  private parseYamlValue(yaml: string, key: string): string {
    const match = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : "";
  }

  private parseYamlArray(yaml: string, key: string): string[] {
    const match = yaml.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, "m"));
    if (!match) return [];
    return match[1]
      .split(",")
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }
}
