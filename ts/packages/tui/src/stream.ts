/**
 * RunTracker —— 统一事件流 → RunModel 状态机（SSE 帧进、渲染模型出）。
 *
 * 契约对应 @pf/protocol events.ts：
 *   run:start / phase:start / thinking / tool:calling / tool:result /
 *   phase:progress / phase:complete / phase:error / phase:awaiting_approval /
 *   self:review / run:complete / run:error
 *
 * 要点：
 *   - tool:calling → tool:result 按 toolName 就地更新（calling → done/failed）
 *   - literature_search 的 toolResult.papers 展开为文献条目行
 *   - phase:awaiting_approval 的 runId 是 phaseRunId（审批端点参数），不是研究 runId
 *   - token 为客户端口径估算（事件流文本），展示带 ~ 前缀
 */
import type { DomainEvent } from "@pf/client";
import { estimateTokens } from "./timer";
import {
  ANSI,
  emptyModel,
  runCompleteLines,
  hypothesisCard,
  type PaperItem,
  type PhaseLine,
  type PhaseState,
  type RunModel,
} from "./render";

const ANSI_RED = ANSI.red;
const ANSI_RESET = ANSI.reset;

export type Decision = "approve" | "modify" | "reject";

export class RunTracker {
  model: RunModel;
  private now: () => number;

  constructor(mode: "auto" | "manual" = "auto", now: () => number = () => Date.now()) {
    this.now = now;
    this.model = emptyModel(mode);
  }

  /** 重置为下一次 run（保留 mode；排队问题是用户待发意图，跨 run 保留） */
  reset(): void {
    const queued = this.model.queued;
    this.model = emptyModel(this.model.mode);
    this.model.queued = queued;
  }

  private currentPhase(): PhaseState | null {
    for (let i = this.model.phases.length - 1; i >= 0; i--) {
      const p = this.model.phases[i];
      if (p.status === "running") return p;
    }
    return this.model.phases.length > 0 ? this.model.phases[this.model.phases.length - 1] : null;
  }

  private appendLine(line: PhaseLine): void {
    const phase = this.currentPhase();
    if (phase) phase.lines.push(line);
  }

  /** 事件入口（SSE onEvent 直连） */
  handle(event: DomainEvent): void {
    switch (event.type) {
      case "run:start":
        this.onRunStart(event);
        break;
      case "phase:start":
        this.onPhaseStart(event);
        break;
      case "thinking":
        this.onThinking(event);
        break;
      case "tool:calling":
        this.onToolCalling(event);
        break;
      case "tool:result":
        this.onToolResult(event);
        break;
      case "phase:progress":
        this.onPhaseProgress(event);
        break;
      case "phase:complete":
      case "phase:error":
        this.onPhaseEnd(event);
        break;
      case "phase:awaiting_approval":
        this.onAwaitingApproval(event);
        break;
      case "self:review":
        this.onSelfReview(event);
        break;
      case "run:complete":
        this.onRunComplete(event);
        break;
      case "run:error":
        this.onRunError(event);
        break;
      default:
        break; // stream:ready / 未知类型不进模型
    }
  }

  private onRunStart(event: DomainEvent): void {
    const keepMode = this.model.mode;
    this.reset();
    this.model.mode = keepMode;
    this.model.status = "running";
    this.model.runId = event.runId;
    this.model.projectId = event.projectId;
    this.model.startedAt = this.now();
    const q = (event.data as { question?: unknown } | undefined)?.question;
    if (typeof q === "string" && q) this.model.question = q;
  }

  private onPhaseStart(event: DomainEvent): void {
    // 同名阶段重跑：先终结旧的 running
    this.model.phases
      .filter((p) => p.name === event.phase && p.status === "running")
      .forEach((p) => {
        p.status = "skipped";
        p.endedAt = this.now();
      });
    this.model.phases.push({
      name: event.phase ?? "?",
      status: "running",
      startedAt: this.now(),
      lines: [],
    });
  }

  private onThinking(event: DomainEvent): void {
    const phase = this.currentPhase();
    if (!phase) return;
    const content = contentOf(event);
    this.model.tokens += estimateTokens(content);
    const iteration = numField(event, "iteration") ?? 1;
    const last = phase.lines[phase.lines.length - 1];
    // 同轮 thinking 更新末行（避免刷屏），新轮追加
    if (last && last.kind === "thinking" && last.iteration === iteration) {
      last.note = content;
    } else {
      phase.lines.push({ kind: "thinking", iteration, note: content, since: this.now() });
    }
  }

  private onToolCalling(event: DomainEvent): void {
    const name = strField(event, "toolName") ?? "?";
    const args = (event.data as { toolArgs?: unknown } | undefined)?.toolArgs;
    this.appendLine({
      kind: "tool",
      toolName: name,
      state: "calling",
      argSummary: summarizeArgs(args),
      since: this.now(),
    });
  }

  private onToolResult(event: DomainEvent): void {
    const name = strField(event, "toolName") ?? "?";
    const content = contentOf(event);
    this.model.tokens += estimateTokens(content);
    const failed = content.startsWith("Error:");
    const papers = extractPapers(event);

    // 找当前/最近阶段里最后一个同名 calling 行，就地更新
    let updated = false;
    for (let i = this.model.phases.length - 1; i >= 0 && !updated; i--) {
      const lines = this.model.phases[i].lines;
      for (let j = lines.length - 1; j >= 0; j--) {
        const line = lines[j];
        if (line.kind === "tool" && line.toolName === name && line.state === "calling") {
          line.state = failed ? "failed" : "done";
          line.resultSummary = papers ? `${papers.length} papers` : brief(content);
          updated = true;
          break;
        }
      }
    }
    const summary = papers ? `${papers.length} papers` : brief(content);
    if (!updated) {
      this.appendLine({
        kind: "tool",
        toolName: name,
        state: failed ? "failed" : "done",
        resultSummary: summary,
      });
    }
    if (papers && papers.length > 0) {
      this.appendLine({ kind: "papers", papers });
    }
  }

  private onPhaseProgress(event: DomainEvent): void {
    const content = contentOf(event);
    this.model.tokens += estimateTokens(content);
    if (content.includes("被跳过")) {
      // resume/中断跳过的阶段：无 phase:start，补一个 skipped 阶段块
      this.model.phases.push({
        name: event.phase ?? "?",
        status: "skipped",
        startedAt: this.now(),
        endedAt: this.now(),
        lines: [{ kind: "progress", text: content }],
      });
      return;
    }
    if (content.startsWith("恢复：")) {
      this.appendLine({ kind: "progress", text: content });
      return;
    }
    this.appendLine({ kind: "progress", text: content });
  }

  private onPhaseEnd(event: DomainEvent): void {
    const phase = [...this.model.phases].reverse().find((p) => p.name === event.phase && p.status === "running");
    if (phase) {
      phase.status = event.type === "phase:complete" ? "complete" : "error";
      phase.endedAt = this.now();
    }
    if (event.type === "phase:error") {
      const reason = contentOf(event) || strField(event, "error") || "未知错误";
      this.appendLine({ kind: "note", text: `阶段失败: ${reason}`, style: "error" });
    }
  }

  private onAwaitingApproval(event: DomainEvent): void {
    const summary = strField(event, "summary") ?? "awaiting approval";
    this.model.approval = {
      phaseRunId: event.runId ?? "",
      phase: event.phase,
      summary,
    };
    this.appendLine({ kind: "approval", summary, phaseRunId: event.runId ?? "" });
  }

  /** 审批已提交（index.ts 调 submitPhaseDecision 成功后回调） */
  resolveApproval(decision: Decision): void {
    this.model.approval = null;
    for (let i = this.model.phases.length - 1; i >= 0; i--) {
      const lines = this.model.phases[i].lines;
      for (let j = lines.length - 1; j >= 0; j--) {
        const line = lines[j];
        if (line.kind === "approval" && !line.resolved) {
          line.resolved = decision === "approve" ? "已批准" : decision === "modify" ? "已要求修改" : "已拒绝";
          return;
        }
      }
    }
  }

  private onSelfReview(event: DomainEvent): void {
    const passed = (event.data as { passed?: unknown } | undefined)?.passed !== false;
    this.appendLine({ kind: "self-review", passed, text: contentOf(event) });
  }

  private onRunComplete(event: DomainEvent): void {
    this.model.status = "complete";
    this.model.endedAt = this.now();
    this.model.approval = null;
    for (const p of this.model.phases) {
      if (p.status === "running") {
        p.status = "complete";
        p.endedAt = this.now();
      }
    }
    const d = (event.data ?? {}) as {
      evidenceCount?: number;
      knowledgeCount?: number;
      reportCount?: number;
      hypothesisStatements?: unknown;
    };
    const epilogue = runCompleteLines(d.evidenceCount ?? 0, d.knowledgeCount ?? 0, d.reportCount ?? 0);
    if (Array.isArray(d.hypothesisStatements)) {
      for (const h of d.hypothesisStatements) {
        if (typeof h === "string" && h) epilogue.push(...hypothesisCard(h));
      }
    }
    this.model.epilogue = epilogue;
  }

  private onRunError(event: DomainEvent): void {
    this.model.status = "error";
    this.model.endedAt = this.now();
    this.model.approval = null;
    const reason = strField(event, "error") || contentOf(event) || "未知错误";
    this.model.epilogue = [`${ANSI_RED}● run:error  ${reason}${ANSI_RESET}`];
  }

  /** 用户主动停止（Esc）：标记 + 提示行 */
  markStopped(reason: string): void {
    if (this.model.status !== "running") return;
    this.model.status = "stopped";
    this.model.endedAt = this.now();
    this.model.approval = null;
    for (const p of this.model.phases) {
      if (p.status === "running") {
        p.status = "skipped";
        p.endedAt = this.now();
      }
    }
    this.model.notice = reason;
  }

  setNotice(text: string | undefined): void {
    this.model.notice = text;
  }

  /** 运行中排队一条问题（主区域 ◇ 行；下一轮开始时 dequeue 转正式输入） */
  enqueueQuestion(text: string): void {
    this.model.queued.push(text);
    this.model.notice = "已排队：当前运行结束后自动发送";
  }

  /** 取出最早排队的问题（FIFO）；无排队返回 undefined */
  dequeueQuestion(): string | undefined {
    return this.model.queued.shift();
  }

  clearQueued(): void {
    this.model.queued.length = 0;
  }
}

/* ------------------------------------------------------------------ */
/*  载荷工具                                                            */
/* ------------------------------------------------------------------ */

function contentOf(event: DomainEvent): string {
  const c = (event.data as { content?: unknown } | undefined)?.content;
  return typeof c === "string" ? c : "";
}

function strField(event: DomainEvent, key: string): string | undefined {
  const v = (event.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === "string" ? v : undefined;
}

function numField(event: DomainEvent, key: string): number | undefined {
  const v = (event.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === "number" ? v : undefined;
}

/** literature_search 的 toolResult.papers（{title,url}[]） */
function extractPapers(event: DomainEvent): PaperItem[] | null {
  const tr = (event.data as { toolResult?: unknown } | undefined)?.toolResult;
  if (tr === null || typeof tr !== "object") return null;
  const papers = (tr as { papers?: unknown }).papers;
  if (!Array.isArray(papers)) return null;
  return papers
    .filter((p): p is { title?: unknown; url?: unknown } => typeof p === "object" && p !== null)
    .map((p) => ({
      title: typeof p.title === "string" ? p.title : "",
      url: typeof p.url === "string" ? p.url : "",
    }));
}

/** 工具参数的一行摘要（literature_search 显示 query，其余 JSON 截断） */
export function summarizeArgs(args: unknown): string | undefined {
  if (args === null || args === undefined) return undefined;
  if (typeof args !== "object") return String(args).slice(0, 60);
  const record = args as Record<string, unknown>;
  if (typeof record.query === "string" && record.query) return `"${record.query}"`;
  if (typeof record.code === "string" && record.code) return `code ${record.code.split("\n")[0].slice(0, 40)}`;
  try {
    return JSON.stringify(record).slice(0, 60);
  } catch {
    return undefined;
  }
}

/** 工具结果内容一行摘要 */
export function brief(content: string): string {
  const firstLine = content.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return firstLine.slice(0, 60);
}
