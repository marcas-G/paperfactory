/**
 * extractToolSummary 单测 —— tool:result 事件 data.summary 的内容提取
 * （信息透明度：SSE 流带可读摘要，而非只有原始 JSON）。
 */
import { describe, it, expect } from "vitest";
import { extractToolSummary } from "../../packages/server/src/routes/research-runs";

describe("extractToolSummary", () => {
  it("literature_search：顶层 papers 数组 → 数量 + 前 3 个标题", () => {
    const summary = extractToolSummary({
      content: "[...]",
      papers: [
        { title: "Scaling Laws for MoE", url: "https://s1" },
        { title: "Neural Scaling", url: "https://s2" },
      ],
      source: "semantic-scholar",
    });
    expect(summary).toBe("2 results: Scaling Laws for MoE / Neural Scaling");
  });

  it("search：content JSON 的 results 数组 → 数量 + 标题", () => {
    const summary = extractToolSummary({
      content: JSON.stringify({
        query: "agent arch",
        results: [
          { title: "Paper A", url: "https://a" },
          { title: "Paper B", url: "https://b" },
          { title: "Paper C", url: "https://c" },
          { title: "Paper D", url: "https://d" },
        ],
        count: 4,
      }),
    });
    expect(summary).toBe("4 results: Paper A / Paper B / Paper C");
  });

  it("content 顶层数组（literature_search 的 content 即 papers JSON）", () => {
    const summary = extractToolSummary({
      content: JSON.stringify([{ title: "T1", url: "u1" }, { title: "T2", url: "u2" }]),
    });
    expect(summary).toBe("2 results: T1 / T2");
  });

  it("对象无 results/papers → 字段名列表", () => {
    expect(extractToolSummary({ content: '{"status":"CONFIRMED","reasoning":"..."}' })).toBe("{status, reasoning}");
  });

  it("纯文本 content → 首行截断 100", () => {
    expect(extractToolSummary({ content: "experiment executed successfully\nline2" })).toBe("experiment executed successfully");
    expect(extractToolSummary({ content: "x".repeat(150) })).toHaveLength(100);
  });

  it("空/非对象输入 → 空串", () => {
    expect(extractToolSummary(null)).toBe("");
    expect(extractToolSummary("text")).toBe("");
    expect(extractToolSummary({})).toBe("");
  });
});
