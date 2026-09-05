import { describe, it, expect } from "vitest";

describe("Skill System", () => {
  it("Skill can be loaded from markdown frontmatter", async () => {
    const { SkillLoader } = await import("@runtime/skills/loader");
    const loader = new SkillLoader();

    const skill = await loader.loadFromYaml({
      name: "lit-review",
      description: "Systematic literature review",
      allowedTools: ["search_scholarly", "parse_pdf"],
      cognitiveMode: "EXPLORE",
      maxIterations: 20,
    });

    expect(skill.name).toBe("lit-review");
    expect(skill.description).toBe("Systematic literature review");
    expect(skill.allowedTools.length).toBe(2);
    expect(skill.cognitiveMode).toBe("EXPLORE");
    expect(skill.maxIterations).toBe(20);
  });

  it("Skill can be converted to LLM prompt context", async () => {
    const { SkillLoader } = await import("@runtime/skills/loader");
    const loader = new SkillLoader();

    const skill = await loader.loadFromYaml({
      name: "meta-analysis",
      description: "Perform meta-analysis on collected studies",
      allowedTools: ["search_scholarly", "run_statistics"],
      cognitiveMode: "SYNTHESIZE",
      maxIterations: 30,
    });

    const prompt = loader.toPromptContext(skill);
    expect(prompt).toContain("meta-analysis");
    expect(prompt).toContain("Perform meta-analysis");
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(10);
  });

  it("SkillSystem registers and retrieves skills", async () => {
    const { SkillSystem } = await import("@runtime/skills/system");
    const system = new SkillSystem();

    await system.register({
      name: "diagnosis",
      description: "Medical differential diagnosis",
      allowedTools: ["search_medical", "calculate_risk"],
      cognitiveMode: "DIAGNOSE",
      maxIterations: 15,
    });

    const found = system.get("diagnosis");
    expect(found).toBeDefined();
    expect(found?.name).toBe("diagnosis");
    expect(found?.cognitiveMode).toBe("DIAGNOSE");
  });

  it("SkillSystem returns undefined for unknown skill", async () => {
    const { SkillSystem } = await import("@runtime/skills/system");
    const system = new SkillSystem();

    const found = system.get("nonexistent");
    expect(found).toBeUndefined();
  });

  it("SkillSystem lists all registered skills", async () => {
    const { SkillSystem } = await import("@runtime/skills/system");
    const system = new SkillSystem();

    await system.register({
      name: "skill-a",
      description: "A",
      allowedTools: [],
      cognitiveMode: "EXPLORE",
      maxIterations: 10,
    });
    await system.register({
      name: "skill-b",
      description: "B",
      allowedTools: [],
      cognitiveMode: "COMPARE",
      maxIterations: 10,
    });

    const list = system.list();
    expect(list.length).toBe(2);
    expect(list.map((s) => s.name)).toContain("skill-a");
    expect(list.map((s) => s.name)).toContain("skill-b");
  });

  it("Skill restricts tools to allowed list", async () => {
    const { SkillLoader } = await import("@runtime/skills/loader");
    const loader = new SkillLoader();

    const skill = await loader.loadFromYaml({
      name: "restricted",
      description: "Only allows specific tools",
      allowedTools: ["search", "read"],
      cognitiveMode: "EXPLORE",
      maxIterations: 10,
    });

    expect(skill.isToolAllowed("search")).toBe(true);
    expect(skill.isToolAllowed("read")).toBe(true);
    expect(skill.isToolAllowed("execute_code")).toBe(false);
  });
});
