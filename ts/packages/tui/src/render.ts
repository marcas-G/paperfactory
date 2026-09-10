/**
 * 渲染引擎 —— 事件流模型 → 屏幕逻辑行。纯函数、无 IO，单测直接断言字符串。
 *
 * 视图模型（stream.ts 的 RunTracker 维护）：
 *   RunModel { phases: PhaseState[], approval, status, ... }
 *   PhaseState { lines: PhaseLine[] } —— 活动行（thinking 带 spinner、tool 有 calling/result 态）
 *
 * 本模块负责：
 *   - CJK 感知的宽度测量 / 截断 / 补空（盒模型右边框对齐的关键）
 *   - 阶段头 / 活动行 / 文献条目 / 假设卡片 / 审批卡片 / 状态栏 / Markdown-lite
 */
import type { DomainEvent } from "@pf/client";
import { compactCount, formatDuration, spinnerFrame } from "./timer";

/* ------------------------------------------------------------------ */
/*  ANSI 常量（screen.ts 与 index.ts 共用；render 输出内嵌颜色）          */
/* ------------------------------------------------------------------ */

export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

/* ------------------------------------------------------------------ */
/*  阶段目录（中文映射）                                                 */
/* ------------------------------------------------------------------ */

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

export const PHASE_ORDER = Object.keys(PHASE_LABELS);

export function phaseLabel(phase: string | undefined): string {
  if (!phase) return "(unknown phase)";
  return PHASE_LABELS[phase] ?? phase;
}

/* ------------------------------------------------------------------ */
/*  CJK 宽度感知的文本度量                                              */
/* ------------------------------------------------------------------ */

const ESC = String.fromCharCode(27);
const ANSI_RE = new RegExp(ESC + "\\[[0-9;?]*[A-Za-z]", "g");
const ANSI_PREFIX_RE = new RegExp("^" + ESC + "\\[[0-9;?]*m");

/** 去掉内嵌 ANSI 转义后的纯文本 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

/** 码点显示宽度（CJK/全角=2，其余=1；ANSI 转义=0） */
export function visibleWidth(text: string): number {
  let w = 0;
  for (const ch of stripAnsi(text)) {
    const code = ch.codePointAt(0) ?? 0;
    w += isWideCodePoint(code) ? 2 : 1;
  }
  return w;
}

function isWideCodePoint(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

/** 按显示宽度截断（超出补 `…`； ANSI 前缀保留） */
export function truncate(text: string, maxWidth: number): string {
  if (visibleWidth(text) <= maxWidth) return text;
  const prefix = text.match(ANSI_PREFIX_RE)?.[0] ?? "";
  const body = stripAnsi(text);
  let w = 0;
  let out = "";
  for (const ch of body) {
    const cw = isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1;
    if (w + cw > maxWidth - 1) break;
    out += ch;
    w += cw;
  }
  return prefix + out + "…";
}

/** 按显示宽度右侧补空格到目标宽度 */
export function padEndDisplay(text: string, width: number): string {
  const gap = width - visibleWidth(text);
  return gap > 0 ? text + " ".repeat(gap) : text;
}

/** 按显示宽度在 col 处切分（[前段, 后段]；不处理内嵌 ANSI——输入缓冲为纯文本） */
export function splitAtDisplay(text: string, col: number): [string, string] {
  let w = 0;
  let i = 0;
  for (const ch of text) {
    const cw = isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1;
    if (w + cw > col) break;
    w += cw;
    i += ch.length;
  }
  return [text.slice(0, i), text.slice(i)];
}

/* ------------------------------------------------------------------ */
/*  视图模型类型（stream.ts 维护，render 只读）                          */
/* ------------------------------------------------------------------ */

export type RunStatus = "idle" | "running" | "complete" | "error" | "stopped";
export type PhaseStatus = "running" | "complete" | "error" | "skipped";

export interface PaperItem {
  title: string;
  url: string;
}

export type PhaseLine =
  | { kind: "thinking"; iteration: number; note: string; since: number }
  | { kind: "tool"; toolName: string; state: "calling" | "done" | "failed"; argSummary?: string; resultSummary?: string; since?: number }
  | { kind: "papers"; papers: PaperItem[] }
  | { kind: "progress"; text: string }
  | { kind: "self-review"; passed: boolean; text: string }
  | { kind: "interrupt"; text: string }
  | { kind: "approval"; summary: string; phaseRunId: string; resolved?: string; expanded?: boolean }
  | { kind: "hypothesis"; statement: string }
  | { kind: "note"; text: string; style?: "dim" | "error" | "ok" | "warn" };

export interface PhaseState {
  name: string;
  status: PhaseStatus;
  startedAt: number;
  endedAt?: number;
  lines: PhaseLine[];
}

export interface ApprovalState {
  phaseRunId: string;
  phase?: string;
  summary: string;
}

export interface RunModel {
  status: RunStatus;
  question?: string;
  runId?: string;
  projectId?: string;
  startedAt?: number;
  endedAt?: number;
  phases: PhaseState[];
  /** 客户端口径 token 估算（事件流文本） */
  tokens: number;
  mode: "auto" | "manual";
  /** 等待审批（manual 模式） */
  approval: ApprovalState | null;
  /** 运行中排队的问题（主区域 ◇ 行可视化，下一轮自动发送） */
  queued: string[];
  /** 一次性状态提示（排队/停止等），渲染在主区域末尾 */
  notice?: string;
  /** run 级收尾行（统计/假设卡片），渲染在全部阶段之后 */
  epilogue: string[];
  /** 报告（run:complete 后拉取填充） */
  reportLines?: string[];
}

export function emptyModel(mode: "auto" | "manual" = "auto"): RunModel {
  return { status: "idle", phases: [], tokens: 0, mode, approval: null, queued: [], epilogue: [] };
}

/* ------------------------------------------------------------------ */
/*  行构造器                                                            */
/* ------------------------------------------------------------------ */

export type PhaseStatusIcon = "✓" | "✗" | "○" | "▶";

/** 阶段状态图标 + 颜色 */
export function phaseStatusMeta(
  status: PhaseStatus,
): { icon: PhaseStatusIcon; label: string; color: string } {
  switch (status) {
    case "complete":
      return { icon: "✓", label: "✓", color: ANSI.green };
    case "error":
      return { icon: "✗", label: "✗", color: ANSI.red };
    case "skipped":
      return { icon: "○", label: "跳过", color: ANSI.gray };
    case "running":
      return { icon: "▶", label: "running", color: ANSI.yellow };
  }
}

/** 阶段头：`● 文献调研 ──────────── ✓ 2m`（dashes 填满 contentWidth） */
export function phaseHeader(
  phase: string,
  status: PhaseStatus,
  elapsedMs: number,
  contentWidth: number,
  tick = 0,
): string {
  const label = phaseLabel(phase);
  const left = `● ${label} `;
  const right =
    status === "running"
      ? `${spinnerFrame(tick)} running`
      : status === "complete"
        ? `✓ ${formatDuration(elapsedMs)}`
        : status === "error"
          ? `✗ ${formatDuration(elapsedMs)}`
          : `○ 跳过`;
  const leftW = visibleWidth(left);
  const rightW = visibleWidth(right);
  const dashes = Math.max(3, contentWidth - leftW - rightW - 2);
  const color = status === "running" ? ANSI.yellow : status === "complete" ? ANSI.green : status === "error" ? ANSI.red : ANSI.gray;
  return `${color}${ANSI.bold}${left}${ANSI.dim}${"─".repeat(dashes)}${ANSI.reset} ${color}${right}${ANSI.reset}`;
}

/** 活动行 label 列对齐宽度（`thinking   `、工具名列） */
const LABEL_WIDTH = 20;

function padLabel(label: string): string {
  const w = visibleWidth(label);
  return w >= LABEL_WIDTH ? label + " " : label + " ".repeat(LABEL_WIDTH - w);
}

/** thinking 行的渐进点动画（1-3 个点循环，随 tick 变化给出"在打字"的流式感） */
export function thinkingDots(tick: number): string {
  // 固定 3 字符宽度：dots 动画不改变行宽，时间不再被推拉
  const active = (tick % 3) + 1;
  return "·".repeat(active) + " ".repeat(3 - active);
}

/** thinking 行：`│  ├ thinking    ⠋ 第 3 轮推理中... (12s)`（dots 随 tick 流动） */
export function thinkingLine(iteration: number, note: string, waitedMs: number, tick: number): string {
  const spin = spinnerFrame(tick);
  const wait = waitedMs > 3000 ? ` ${ANSI.dim}(${formatDuration(waitedMs)})${ANSI.reset}` : "";
  // note 自带轮次前缀（后端原样发"第 N 轮推理中..."）时去重
  const body = /^第\s*\d+\s*轮/.test(note) ? note : `第 ${iteration} 轮${note ? ` — ${note}` : ""}`;
  return `${ANSI.yellow}${spin}${ANSI.reset} ${padLabel("thinking")}${truncate(body, 60)}${ANSI.dim}${thinkingDots(tick)}${ANSI.reset}${wait}`;
}

/** 工具行：calling `⠙ literature_search  "query"... (3s)` / result `├ literature_search  5 papers ✓`
 *  calling 态带 spinner + 等待时长（tool:calling → tool:result 之间的持续视觉反馈） */
export function toolLine(
  toolName: string,
  state: "calling" | "done" | "failed",
  argSummary: string | undefined,
  resultSummary: string | undefined,
  waitedMs = 0,
  tick = 0,
): string {
  const label = padLabel(toolName);
  if (state === "calling") {
    const arg = argSummary ? ` ${truncate(argSummary, 48)}` : "";
    const wait = waitedMs > 3000 ? ` ${ANSI.dim}(${formatDuration(waitedMs)})${ANSI.reset}` : "";
    return `${ANSI.cyan}${spinnerFrame(tick)}${ANSI.reset} ${label}${ANSI.dim}${arg}...${ANSI.reset}${wait}`;
  }
  const mark = state === "done" ? `${ANSI.green}✓${ANSI.reset}` : `${ANSI.red}✗${ANSI.reset}`;
  const summary = resultSummary ? ` ${truncate(resultSummary, 48)}` : "";
  return `${mark} ${label}${summary}`;
}

/** 文献条目块：`[1] Title...` + 换行 URL（缩进对齐） */
export function paperEntries(papers: PaperItem[], startIndex = 0): string[] {
  const lines: string[] = [];
  papers.forEach((p, i) => {
    lines.push(`${ANSI.gray}[${startIndex + i + 1}]${ANSI.reset} ${truncate(p.title || "(untitled)", 68)}`);
    if (p.url) lines.push(`    ${ANSI.dim}${truncate(p.url, 72)}${ANSI.reset}`);
  });
  return lines;
}

/** 假设卡片（单行紧凑版，盒线在窄终端下不可靠） */
export function hypothesisCard(statement: string): string[] {
  return [
    `${ANSI.magenta}┌ hypothesis ${"─".repeat(Math.max(3, 40))}┐${ANSI.reset}`,
    `${ANSI.magenta}│${ANSI.reset} ${truncate(statement, 66)}`,
    `${ANSI.magenta}└${"─".repeat(Math.max(3, 52))}┘${ANSI.reset}`,
  ];
}

/** 审批卡片可展开的详情行数上限 */
export const APPROVAL_DETAIL_LINES = 10;

/**
 * 审批详情内容 —— 该阶段最后一个 self-review / thinking / progress 行的文本
 * （按事件流语义即"最后一个 self-review 或 message 事件的 content"）。
 */
export function approvalDetailText(phase: PhaseState): string | null {
  for (let i = phase.lines.length - 1; i >= 0; i--) {
    const line = phase.lines[i];
    if (line.kind === "self-review") return line.text;
    if (line.kind === "thinking") return line.note;
    if (line.kind === "progress") return line.text;
  }
  return null;
}

/** 审批卡片（expanded 时展开最后 10 行详情内容，按终端宽度截断） */
export function approvalCard(
  summary: string,
  opts: { expanded?: boolean; detail?: string | null; width?: number } = {},
): string[] {
  const width = opts.width ?? 76;
  const lines = [
    `${ANSI.yellow}${ANSI.bold}⚠ 等待审批:${ANSI.reset} ${truncate(summary, 60)}`,
    `${ANSI.dim}   [a] 批准  [m] 修改  [r] 拒绝  [d] ${opts.expanded ? "收起" : "详情"}${ANSI.reset}`,
  ];
  if (!opts.expanded) return lines;
  const rows = (opts.detail ?? "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .slice(-APPROVAL_DETAIL_LINES);
  if (rows.length === 0) {
    lines.push(`${ANSI.dim}   无详细信息${ANSI.reset}`);
    return lines;
  }
  for (const row of rows) {
    lines.push(`${ANSI.dim}   │ ${truncate(row, Math.max(10, width - 5))}${ANSI.reset}`);
  }
  return lines;
}

/** 回看提示条：滚动时钉在主区域底行 */
export function scrollIndicatorLine(firstVisible: number, totalLines: number): string {
  return `${ANSI.yellow}↑ 滚动中 (第 ${Math.max(1, firstVisible)}/${Math.max(1, totalLines)} 行) — 按End回底部${ANSI.reset}`;
}

/** 树前缀：`│  ├ ` / `│  └ `（末行） */
export function childPrefix(isLast: boolean): string {
  return isLast ? "│  └ " : "│  ├ ";
}

/** 子树缩进（文献条目挂在 tool:result 下） */
export const NEST_PREFIX = "│  │   ";

/* ------------------------------------------------------------------ */
/*  模型 → 逻辑行                                                       */
/* ------------------------------------------------------------------ */

/** 单个阶段 → 逻辑行（头 + 活动行树） */
export function renderPhase(phase: PhaseState, now: number, tick: number, contentWidth: number): string[] {
  const elapsed = (phase.endedAt ?? now) - phase.startedAt;
  const lines: string[] = [phaseHeader(phase.name, phase.status, elapsed, contentWidth, tick)];
  const lastIdx = phase.lines.length - 1;
  phase.lines.forEach((line, i) => {
    const prefix = childPrefix(i === lastIdx);
    const body = renderPhaseLine(line, now, tick, phase, contentWidth);
    if (Array.isArray(body)) {
      body.forEach((b, j) => {
        lines.push(j === 0 ? prefix + b : NEST_PREFIX + b);
      });
    } else if (body !== null) {
      lines.push(prefix + body);
    }
  });
  return lines;
}

function renderPhaseLine(
  line: PhaseLine,
  now: number,
  tick: number,
  phase: PhaseState,
  contentWidth: number,
): string | string[] | null {
  switch (line.kind) {
    case "thinking":
      return thinkingLine(line.iteration, line.note, now - line.since, tick);
    case "tool":
      return toolLine(
        line.toolName,
        line.state,
        line.argSummary,
        line.resultSummary,
        line.since !== undefined ? now - line.since : 0,
        tick,
      );
    case "papers":
      return paperEntries(line.papers);
    case "progress":
      return `${ANSI.dim}${truncate(line.text, 70)}${ANSI.reset}`;
    case "self-review":
      return `${line.passed ? `${ANSI.green}✓${ANSI.reset}` : `${ANSI.red}✗${ANSI.reset}`} ${padLabel("self-review")}${truncate(line.text, 50)}`;
    case "interrupt":
      return `${ANSI.yellow}✋ ${truncate(line.text, 66)}${ANSI.reset}`;
    case "approval": {
      if (line.resolved) {
        return `${ANSI.dim}审批已处理: ${line.resolved}${ANSI.reset}`;
      }
      return approvalCard(line.summary, {
        expanded: line.expanded ?? false,
        detail: approvalDetailText(phase),
        width: contentWidth,
      });
    }
    case "hypothesis":
      return hypothesisCard(line.statement);
    case "note":
      return colorNote(line.text, line.style);
    default:
      return null;
  }
}

function colorNote(text: string, style: "dim" | "error" | "ok" | "warn" | undefined): string {
  switch (style) {
    case "error":
      return `${ANSI.red}${truncate(text, 70)}${ANSI.reset}`;
    case "ok":
      return `${ANSI.green}${truncate(text, 70)}${ANSI.reset}`;
    case "warn":
      return `${ANSI.yellow}${truncate(text, 70)}${ANSI.reset}`;
    default:
      return `${ANSI.dim}${truncate(text, 70)}${ANSI.reset}`;
  }
}

/** run:complete 统计行 */
export function runCompleteLines(evidenceCount: number, knowledgeCount: number, reportCount: number): string[] {
  const stats = `${evidenceCount} evidence · ${knowledgeCount} knowledge · ${reportCount} reports`;
  return [
    `${ANSI.green}${ANSI.bold}● run:complete ✓${ANSI.reset}  ${ANSI.dim}${stats}${ANSI.reset}`,
  ];
}

/** 状态栏：`文献调研 → 缺口识别 · 2/8 阶段 · 3m 12s · ~1.2k tok · auto` */
export function statusLine(model: RunModel, now: number): string {
  const total = PHASE_ORDER.length;
  const processed = model.phases.filter((p) => p.status !== "running").length;
  const errors = model.phases.filter((p) => p.status === "error").length;
  const current = model.phases.find((p) => p.status === "running");
  const arrow = current ? `${model.phases.filter((p) => p.status !== "running").map((p) => phaseLabel(p.name)).slice(-1)[0] ?? "启动"} → ${phaseLabel(current.name)}` : model.status === "running" ? "准备中" : "空闲";
  const elapsed = model.startedAt ? formatDuration((model.endedAt ?? now) - model.startedAt) : "00m 00s";
  const approvalTag = model.approval ? `${ANSI.yellow}${ANSI.bold}⏸ 待审批${ANSI.reset} · ` : "";
  const errTag = errors > 0 ? ` · ${errors}✗` : "";
  return `${approvalTag}${truncate(arrow, 28)} · ${processed}/${total} 阶段${errTag} · ${elapsed} · ~${compactCount(model.tokens)} tok · ${model.mode}`;
}

/** 输入行提示（空闲/运行中/审批中三种语境） */
export function promptHint(model: RunModel): string {
  if (model.approval) return "a/m/r 审批 · d 详情 · Esc 停止";
  if (model.status === "running") return "Enter 排队 · Esc 停止";
  if (model.reportLines) return "Enter 发送 · r 读报告 · Tab 切模式";
  return "Enter 发送 · Tab 切模式 · ? 帮助";
}

/** 排队问题行：`◇ 已排队: {text}`（主区域可视化，下一轮开始自动转为正式输入） */
export function queuedLine(text: string): string {
  return `${ANSI.cyan}◇${ANSI.reset} ${ANSI.dim}已排队:${ANSI.reset} ${truncate(text, 66)}`;
}

/** 完整模型 → 主区域逻辑行 */
export function renderModel(model: RunModel, now: number, tick: number, contentWidth: number): string[] {
  const lines: string[] = [];
  if (model.question) {
    lines.push(`${ANSI.bold}◆ ${truncate(model.question, contentWidth - 4)}${ANSI.reset}`);
    lines.push("");
  }
  for (const phase of model.phases) {
    lines.push(...renderPhase(phase, now, tick, contentWidth));
  }
  if (model.epilogue.length > 0) {
    lines.push(...model.epilogue);
  }
  if (model.reportLines) {
    lines.push("", ...model.reportLines);
  }
  if (model.queued.length > 0) {
    lines.push("");
    for (const q of model.queued) lines.push(queuedLine(q));
  }
  if (model.notice) {
    lines.push("", colorNote(model.notice, "warn"));
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/*  键盘帮助覆盖层（? / :help）                                         */
/* ------------------------------------------------------------------ */

export interface HelpEntry {
  key: string;
  desc: string;
}

/** 帮助条目（覆盖层主体；index.ts 组装 dim 化的主内容 + 浮层） */
export const HELP_ENTRIES: HelpEntry[] = [
  { key: "Enter", desc: "发送问题（运行中 = 排队下一轮）" },
  { key: "Esc", desc: "停止当前 run" },
  { key: "Tab", desc: "切换 auto / manual 模式" },
  { key: "↑ / ↓", desc: "滚动主区域（内容不满一屏时翻输入历史）" },
  { key: "PgUp / PgDn", desc: "主区域半屏滚动" },
  { key: "End", desc: "跳回底部（回看时）；输入行尾（其他）" },
  { key: "← / → / Home", desc: "移动输入光标 / 跳行首" },
  { key: "Backspace / Del", desc: "删除光标前 / 后的字符" },
  { key: "Ctrl+C", desc: "连按两次退出（防误触）" },
  { key: "Ctrl+L", desc: "强制整屏重绘" },
  { key: "?", desc: "显示本帮助" },
  { key: "r", desc: "阅读完整报告（run 完成后）" },
  { key: "a / m / r", desc: "审批：批准 / 修改 / 拒绝" },
  { key: "d", desc: "审批等待时：展开 / 收起该阶段详情" },
  { key: ":chain <type> <id>", desc: "查看证据链" },
  { key: ":resume [projectId]", desc: "恢复最近的项目（可数字选择）" },
  { key: ":mode auto|manual", desc: "直接设定模式" },
  { key: ":report", desc: "进入报告阅读模式" },
  { key: ":stop / :clear / :quit", desc: "停止 / 清屏 / 退出" },
];

/** 帮助覆盖层行（主内容 dim 后浮在上面；按任意键关闭） */
export function helpOverlayLines(contentWidth: number): string[] {
  const keyWidth = 24;
  const lines: string[] = [
    `${ANSI.bold}${ANSI.cyan}  键盘快捷键 ─ 按任意键关闭${ANSI.reset}`,
    "",
  ];
  for (const e of HELP_ENTRIES) {
    const key = padEndDisplay(e.key, keyWidth);
    lines.push(`  ${ANSI.yellow}${key}${ANSI.reset}${truncate(e.desc, contentWidth - keyWidth - 4)}`);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Markdown-lite（报告渲染：# → 粗体、``` → 缩进块、- → •）              */
/* ------------------------------------------------------------------ */

export function renderMarkdown(text: string, maxLines = 60): string[] {
  const out: string[] = [];
  const src = text.split("\n").slice(0, maxLines);
  let inCode = false;
  for (const raw of src) {
    let line = raw.replace(/\s+$/, "");
    if (line.startsWith("```")) {
      inCode = !inCode;
      out.push(`${ANSI.dim}${inCode ? "┌ code" : "└ end"}${ANSI.reset}`);
      continue;
    }
    if (inCode) {
      out.push(`${ANSI.dim}  ${truncate(raw, 74)}${ANSI.reset}`);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      line = `${ANSI.bold}${line.replace(/^#{1,6}\s/, "").toUpperCase()}${ANSI.reset}`;
    } else if (/^\s*[-*]\s/.test(line)) {
      line = line.replace(/^(\s*)[-*]\s/, "$1• ");
    } else if (/^\s*\d+\.\s/.test(line)) {
      line = line.replace(/^(\s*)(\d+)\.\s/, "$1$2. ");
    }
    if (line.trim() === "") out.push("");
    else out.push(truncate(line, 76));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  兼容层：旧 renderTimeline（一次性打印路径仍在用）                      */
/* ------------------------------------------------------------------ */

function dataContent(event: DomainEvent): string {
  const c = (event.data as { content?: unknown } | undefined)?.content;
  return typeof c === "string" ? c : "";
}

/** 事件数组 → 旧式时间线行（保留给非 TTY 降级输出/单测对照） */
export function renderTimeline(events: DomainEvent[], projectId?: string): string[] {
  const model = emptyModel();
  const lines: string[] = [];
  let phase: PhaseState | null = null;
  for (const event of events) {
    switch (event.type) {
      case "run:start":
        model.question = (event.data as { question?: unknown } | undefined)?.question as string | undefined;
        lines.push(`● run:start${model.question ? "  research started: " + truncate(model.question, 60) : ""}`);
        break;
      case "phase:start":
        phase = { name: event.phase ?? "?", status: "running", startedAt: 0, lines: [] };
        model.phases.push(phase);
        lines.push(`● ${phaseLabel(event.phase)}`);
        break;
      case "phase:complete":
        if (phase) phase.status = "complete";
        lines.push(`● ${phaseLabel(event.phase)} ✓`);
        break;
      case "phase:error":
        if (phase) phase.status = "error";
        lines.push(`● ${phaseLabel(event.phase)} ✗${dataContent(event) ? " " + truncate(dataContent(event), 60) : ""}`);
        break;
      case "run:complete": {
        const d = (event.data ?? {}) as { evidenceCount?: number; knowledgeCount?: number; reportCount?: number };
        lines.push(
          `● run:complete ✓  ${d.evidenceCount ?? 0} evidence, ${d.knowledgeCount ?? 0} knowledge, ${d.reportCount ?? 0} reports`,
        );
        lines.push(`  reports → GET /api/projects/${projectId ?? event.projectId ?? ":id"}/reports`);
        break;
      }
      case "run:error":
        lines.push(`● run:error${dataContent(event) || (event.data as { error?: unknown } | undefined)?.error ? "  " + truncate(String((event.data as { error?: unknown } | undefined)?.error ?? dataContent(event)), 80) : ""}`);
        break;
      case "thinking":
        lines.push(`│  ├ thinking  ${dataContent(event)}`);
        break;
      case "tool:result": {
        const d = event.data as { toolName?: string; toolResult?: { papers?: unknown[] } } | undefined;
        const n = Array.isArray(d?.toolResult?.papers) ? d!.toolResult!.papers!.length : null;
        lines.push(`│  ├ ${d?.toolName ?? "?"}${n !== null ? `  ${n} papers` : ""} ${dataContent(event).startsWith("Error:") ? "✗" : "✓"}`);
        break;
      }
      case "phase:awaiting_approval": {
        const s = (event.data as { summary?: unknown } | undefined)?.summary;
        lines.push(`│  ├ approval  ⏸ ${typeof s === "string" ? truncate(s, 50) : "awaiting approval"}`);
        break;
      }
      default:
        break;
    }
  }
  return lines;
}
