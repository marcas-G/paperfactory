/**
 * 时间线渲染 —— 纯函数（事件数组 → 行文本），无 IO，便于单测。
 *
 * 行格式（对照 docs/PROTOCOL.md 事件目录）：
 * ```
 * ● run:start        research started: <question 截断 60 字>
 * ● 文献调研
 * │  ├ thinking      第 1 轮推理中...
 * │  ├ literature_search  5 papers ✓
 * │  └ ...
 * ● 文献调研 ✓
 * ```
 */
import type { DomainEvent } from "@pf/client";

/** phase 名 → 中文 label（8 个阶段，写死在 TUI 侧） */
export const PHASE_LABELS: Record<string, string> = {
  literature_search: "文献调研",
  gap_identification: "缺口识别",
  hypothesis_generation: "假设生成",
  experiment_design: "实验设计",
  experiment_execution: "实验执行",
  evidence_assessment: "证据评估",
  confirmation: "确证验证",
  report_generation: "报告生成",
};

export function phaseLabel(phase: string | undefined): string {
  if (!phase) return "(unknown phase)";
  return PHASE_LABELS[phase] ?? phase;
}

/** tree 前缀：阶段内非末行 `│  ├ `，末行 `│  └ ` */
export function childPrefix(isLast: boolean): string {
  return isLast ? "│  └ " : "│  ├ ";
}

/** `label` 与固定宽度对齐（label 区 18 列，输出形如 `thinking      ...`） */
function padLabel(label: string, width = 18): string {
  return label.length >= width ? label + " " : label + " ".repeat(width - label.length);
}

/** 截断到 max 字符 */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

/** toolResult 里 papers 数组的长度（literature_search 工具：{ content, papers, source }） */
function papersCount(event: DomainEvent): number | null {
  const toolResult = (event.data as { toolResult?: unknown } | undefined)?.toolResult;
  if (toolResult === null || typeof toolResult !== "object") return null;
  const papers = (toolResult as { papers?: unknown }).papers;
  return Array.isArray(papers) ? papers.length : null;
}

function dataStr(event: DomainEvent): string {
  const content = (event.data as { content?: unknown } | undefined)?.content;
  return typeof content === "string" ? content : "";
}

/** 阶段头行：`● 文献调研` */
export function phaseHeaderLine(event: DomainEvent): string {
  return `● ${phaseLabel(event.phase)}`;
}

/** 阶段完成行：`● 文献调研 ✓` / 失败 `● 文献调研 ✗ <原因>` */
export function phaseCompleteLine(event: DomainEvent, ok: boolean): string {
  const label = phaseLabel(event.phase);
  if (ok) return `● ${label} ✓`;
  const reason = dataStr(event) || (event.data as { error?: unknown } | undefined)?.error;
  return `● ${label} ✗${typeof reason === "string" && reason ? " " + truncate(reason, 60) : ""}`;
}

/** run:start 行：`● run:start  research started: <q 截断 60>` */
export function runStartLine(event: DomainEvent): string {
  const question = (event.data as { question?: unknown } | undefined)?.question;
  const q = typeof question === "string" ? question : "";
  return `● run:start${q ? "  research started: " + truncate(q, 60) : ""}`;
}

/** run:complete 行（含产出统计 + 报告获取提示） */
export function runCompleteLine(event: DomainEvent, projectId?: string): string[] {
  const d = (event.data ?? {}) as {
    evidenceCount?: number;
    knowledgeCount?: number;
    reportCount?: number;
  };
  const stats = [
    typeof d.evidenceCount === "number" ? `${d.evidenceCount} evidence` : null,
    typeof d.knowledgeCount === "number" ? `${d.knowledgeCount} knowledge` : null,
    typeof d.reportCount === "number" ? `${d.reportCount} reports` : null,
  ].filter((s): s is string => s !== null);
  const lines = [`● run:complete ✓${stats.length ? "  " + stats.join(", ") : ""}`];
  lines.push(
    projectId
      ? `  reports → GET /api/projects/${projectId}/reports`
      : `  reports → GET /api/projects/:id/reports`
  );
  return lines;
}

/** run:error 行 */
export function runErrorLine(event: DomainEvent): string {
  const error = (event.data as { error?: unknown } | undefined)?.error;
  return `● run:error${typeof error === "string" && error ? "  " + truncate(error, 80) : ""}`;
}

/** 阶段内子行（不含 tree 前缀）；返回 null 表示不渲染（stream:ready 等） */
export function childBody(event: DomainEvent): string | null {
  const content = dataStr(event);
  switch (event.type) {
    case "thinking":
      return `${padLabel("thinking")}${content || "推理中..."}`;
    case "phase:progress":
      return `${padLabel("progress")}${truncate(content, 70)}`;
    case "tool:calling": {
      const name = (event.data as { toolName?: unknown } | undefined)?.toolName ?? "?";
      return `${padLabel(String(name))}…`;
    }
    case "tool:result": {
      const name = (event.data as { toolName?: unknown } | undefined)?.toolName ?? "?";
      const n = papersCount(event);
      const failed = content.startsWith("Error:");
      const suffix = n !== null ? `  ${n} papers` : "";
      return `${padLabel(String(name) + suffix)}${failed ? "✗" : "✓"}`;
    }
    case "self:review": {
      const passed = (event.data as { passed?: unknown } | undefined)?.passed;
      return `${padLabel("self-review")}${passed === false ? "✗" : "✓"} ${truncate(content, 50)}`.trimEnd();
    }
    case "phase:awaiting_approval": {
      const summary = (event.data as { summary?: unknown } | undefined)?.summary;
      return `${padLabel("approval")}⏸ ${typeof summary === "string" ? truncate(summary, 50) : "awaiting approval"}`;
    }
    case "user:interrupt":
      return `${padLabel("interrupt")}${content}`;
    default:
      return null;
  }
}

/** 完整子行（含前缀） */
export function childLine(event: DomainEvent, isLast: boolean): string {
  const body = childBody(event);
  return body === null ? "" : childPrefix(isLast) + body;
}

/**
 * 纯渲染：事件数组 → 时间线行数组（后端增量打印与单测共用同一套行构造器）。
 *
 * 分组规则：phase:start 到 phase:complete/error 之间的事件为该阶段子行，
 * 最后一个子行用 `└`；run:start / run:complete / run:error 独立成行。
 */
export function renderTimeline(events: DomainEvent[], projectId?: string): string[] {
  const lines: string[] = [];
  let pending: DomainEvent[] = []; // 当前阶段尚未决定 ├/└ 的子行

  const flushPending = (isLastOfPhase: boolean): void => {
    pending.forEach((ev, i) => {
      const isLast = isLastOfPhase && i === pending.length - 1;
      const line = childLine(ev, isLast);
      if (line !== "") lines.push(line);
    });
    pending = [];
  };

  for (const event of events) {
    switch (event.type) {
      case "stream:ready":
        break;
      case "run:start":
        flushPending(false);
        lines.push(runStartLine(event));
        break;
      case "phase:start":
        flushPending(false);
        lines.push(phaseHeaderLine(event));
        break;
      case "phase:complete":
        flushPending(true);
        lines.push(phaseCompleteLine(event, true));
        break;
      case "phase:error":
        flushPending(true);
        lines.push(phaseCompleteLine(event, false));
        break;
      case "run:complete":
        flushPending(true);
        lines.push(...runCompleteLine(event, projectId ?? event.projectId));
        break;
      case "run:error":
        flushPending(true);
        lines.push(runErrorLine(event));
        break;
      default:
        if (childBody(event) !== null) pending.push(event);
        break;
    }
  }
  flushPending(true);
  return lines;
}
