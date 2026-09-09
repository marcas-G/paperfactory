import { describe, it, expect } from "vitest";
import { collectKnownSources, enforceCitationGate } from "@pf/research/citation-gate";

/** REQ-R5 引用门验证：报告引用 ⊆ 知识库来源，未命中的论文类引用被剥离。 */

const KNOWLEDGE = [
  {
    knowledgeId: "k1",
    sourceIds: ["http://arxiv.org/abs/2503.16581v1"],
    metadata: { url: "http://arxiv.org/abs/2411.18583v2" },
  },
];

describe("citation gate (REQ-R5)", () => {
  it("已知来源（含版本号差异）保留计数", () => {
    const known = collectKnownSources(KNOWLEDGE);
    const r = enforceCitationGate(
      "结论见 [1](http://arxiv.org/abs/2503.16581v2) 与 http://arxiv.org/abs/2411.18583v1。",
      known,
    );
    expect(r.sourced).toBe(2);
    expect(r.unsourced).toBe(0);
    expect(r.content).toContain("2503.16581");
  });

  it("未入库的论文引用被剥离并记录", () => {
    const known = collectKnownSources(KNOWLEDGE);
    const r = enforceCitationGate(
      "见 http://arxiv.org/abs/9999.9999 与 https://www.semanticscholar.org/paper/fake。",
      known,
    );
    expect(r.unsourced).toBe(2);
    expect(r.content).not.toContain("9999.9999");
    expect(r.removed.length).toBe(2);
  });

  it("非学术链接（localhost 等）不剥离", () => {
    const known = collectKnownSources(KNOWLEDGE);
    const r = enforceCitationGate("服务地址 http://localhost:3001/api 与图片 http://img.example.com/a.png", known);
    expect(r.unsourced).toBe(0);
    expect(r.content).toContain("localhost");
  });
});
