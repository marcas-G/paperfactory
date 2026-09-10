#!/usr/bin/env node
/**
 * pf-tui —— OpenCode 风格终端客户端（纯 ANSI + @pf/client SDK + SSE，零新依赖）。
 *
 * 用法：
 *   pf-tui                                        # 交互模式（默认）
 *   pf-tui "研究问题"                              # 一次性研究，完成即退出
 *   pf-tui --list
 *   pf-tui --resume                               # 从最近项目恢复（数字选择）
 *
 * 按键：Enter 发送/排队 · Esc 停止 run · Tab 切 auto/manual · Ctrl+C 连按两次退出
 *       ↑/↓ 滚动主区域（PgUp/PgDn 半屏 · End 回底；内容不满一屏时 ↑/↓ 翻输入历史）
 *       鼠标滚轮 滚动主区域/报告翻页（SGR 模式，enter 时自动启用）
 *       ←/→ Home 光标移动 · r 报告阅读 · ? 帮助覆盖层
 * 审批等待时：a 批准 / m 修改 / r 拒绝 / d 展开/收起详情
 * 命令：:help :mode :chain <objectType> <objectId> :resume <projectId> :report :stop :clear :quit
 *
 * 鼠标优先（零学习成本）：审批按钮/展开详情/翻页/回底/关闭/状态栏切模式/resume 选择器
 * 全部可点击（反色按钮 = 可点）；点击主区域空白进入滚动回看，点击输入行聚焦输入。
 * 键盘全部保留为备选。实现：render 产出反色按钮 span → renderNow 后 scanButtons 重建
 * HitRegion（物理坐标）→ click 事件碰撞检测分发。
 */
import * as readline from "node:readline";
import {
  fetchAdapter,
  getEvidenceChain,
  getProjectReports,
  getProjects,
  resumeResearch,
  startResearch,
  stopResearchRun,
  submitPhaseDecision,
} from "@pf/client";
import type { ClientAdapter } from "@pf/client";
import type { DomainEvent } from "@pf/client";
import { subscribeSse } from "./sse";
import type { SseSubscription } from "./sse";
import { InputHandler, type Key } from "./input";
import { Screen } from "./screen";
import { RunTracker, type Decision } from "./stream";
import { createPager, pagerMove, pagerView, type PagerState } from "./pager";
import {
  createScroll,
  isScrolled,
  scrollBy,
  snapToBottom,
  updateTotal,
  viewRange,
} from "./scroll";
import {
  ANSI,
  PHASE_ORDER,
  button,
  helpOverlayLines,
  pagerNavLine,
  parseReportContent,
  promptHint,
  renderMarkdown,
  renderModel,
  scanButtons,
  scrollIndicatorLine,
  splitAtDisplay,
  statusLine,
  stripAnsi,
  truncate,
  visibleWidth,
} from "./render";

/* ------------------------------------------------------------------ */
/*  CLI 参数                                                            */
/* ------------------------------------------------------------------ */

interface CliArgs {
  question?: string;
  url: string;
  list: boolean;
  resume: boolean;
  timeoutMs: number;
  mode: "auto" | "manual";
  modelLabel?: string;
}

const HELP = `pf-tui — PaperFactory terminal client (OpenCode-style)

用法:
  pf-tui                                          交互模式
  pf-tui "<研究问题>"                              一次性研究（完成即退出）
  pf-tui --list                                   列出项目
  pf-tui --resume                                 从最近项目恢复（数字选择）

选项:
  --url <base>      API 根地址（默认 http://localhost:3001 或 PF_URL）
  --mode <m>        auto | manual（默认 auto；交互中 Tab 切换，下一 run 生效）
  --model <name>    标题栏模型标签（仅展示）
  --timeout <ms>    一次性模式最长等待（默认 30000）
  -h, --help        帮助`;

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    url: process.env.PF_URL ?? "http://localhost:3001",
    list: false,
    resume: false,
    timeoutMs: 30_000,
    mode: "auto",
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") args.list = true;
    else if (a === "--resume") args.resume = true;
    else if (a === "--url") args.url = argv[++i] ?? args.url;
    else if (a === "--mode") args.mode = argv[++i] === "manual" ? "manual" : "auto";
    else if (a === "--model") args.modelLabel = argv[++i];
    else if (a === "--timeout") args.timeoutMs = Number(argv[++i] ?? 30_000) || 30_000;
    else if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    } else positional.push(a);
  }
  args.question = positional.join(" ").trim() || undefined;
  return args;
}

/** 项目列表（--list，普通打印，不进全屏） */
async function listProjects(url: string): Promise<void> {
  const client = fetchAdapter(url);
  const projects = await getProjects(client);
  if (projects.length === 0) {
    console.log(`no projects (${url})`);
    return;
  }
  console.log(`${ANSI.bold}projects${ANSI.reset} (${projects.length}) @ ${url}`);
  for (const p of projects) {
    console.log(`  ${p.id.slice(0, 8)}  ${p.status.padEnd(10)} ${p.createdAt.slice(0, 19)}  ${p.name}`);
  }
}

/* ------------------------------------------------------------------ */
/*  输入行编辑（码点安全）+ 历史浏览                                     */
/* ------------------------------------------------------------------ */

const MAX_INPUT_CP = 200;
const HISTORY_LIMIT = 100;

export interface InputView {
  /** 显示窗口文本（已按宽度裁剪） */
  text: string;
  /** 光标列（相对窗口起点） */
  cursorCol: number;
}

/** 输入缓冲 + 光标 + 历史的可编辑状态（index.ts 拆出的纯逻辑，单测直测） */
export class InputState {
  buf = "";
  /** 光标（码点索引；0..len） */
  cursor = 0;
  private history: string[] = [];
  private historyIdx = -1;
  private draft = "";

  get length(): number {
    return Array.from(this.buf).length;
  }

  setText(text: string): void {
    this.buf = Array.from(text).slice(0, MAX_INPUT_CP).join("");
    this.cursor = Array.from(this.buf).length;
  }

  insert(text: string): void {
    const cps = Array.from(this.buf);
    const add = Array.from(text);
    if (cps.length + add.length > MAX_INPUT_CP) add.splice(MAX_INPUT_CP - cps.length);
    cps.splice(this.cursor, 0, ...add);
    this.buf = cps.join("");
    this.cursor += add.length;
  }

  backspace(): void {
    if (this.cursor === 0) return;
    const cps = Array.from(this.buf);
    cps.splice(this.cursor - 1, 1);
    this.buf = cps.join("");
    this.cursor--;
  }

  /** Delete 键：删光标后字符 */
  deleteForward(): void {
    const cps = Array.from(this.buf);
    if (this.cursor >= cps.length) return;
    cps.splice(this.cursor, 1);
    this.buf = cps.join("");
  }

  move(delta: number): void {
    this.cursor = Math.min(Math.max(0, this.cursor + delta), this.length);
  }

  home(): void {
    this.cursor = 0;
  }

  end(): void {
    this.cursor = this.length;
  }

  /** 提交：进历史、清缓冲（返回提交文本） */
  commit(): string {
    const line = this.buf;
    this.buf = "";
    this.cursor = 0;
    if (line && this.history[this.history.length - 1] !== line) {
      this.history.push(line);
      if (this.history.length > HISTORY_LIMIT) this.history.shift();
    }
    this.historyIdx = -1;
    return line;
  }

  /** ↑：向旧翻历史（首次进入暂存草稿） */
  prevHistory(): string | null {
    if (this.history.length === 0) return null;
    if (this.historyIdx === -1) {
      this.draft = this.buf;
      this.historyIdx = this.history.length - 1;
    } else if (this.historyIdx > 0) {
      this.historyIdx--;
    }
    this.setText(this.history[this.historyIdx]);
    return this.buf;
  }

  /** ↓：向新翻历史，翻出尽头恢复草稿 */
  nextHistory(): string | null {
    if (this.historyIdx === -1) return null;
    this.historyIdx++;
    if (this.historyIdx >= this.history.length) {
      this.historyIdx = -1;
      this.setText(this.draft);
    } else {
      this.setText(this.history[this.historyIdx]);
    }
    return this.buf;
  }

  get historyLength(): number {
    return this.history.length;
  }

  /** 历史快照（测试用） */
  historySnapshot(): readonly string[] {
    return this.history;
  }
}

/** 长输入的水平滚动窗口：光标尽量保持在窗口内（居中倾向） */
export function computeInputView(buf: string, cursor: number, maxCols: number): InputView {
  const cps = Array.from(buf);
  const widths = cps.map((c) => visibleWidth(c));
  const total = widths.reduce((a, b) => a + b, 0);
  if (total <= maxCols) return { text: buf, cursorCol: total };
  let before = 0;
  for (let i = 0; i < Math.min(cursor, cps.length); i++) before += widths[i];
  // 窗口起点：光标居中，钳到 [0, total-maxCols]，对齐码点边界
  let acc = 0;
  let startIdx = 0;
  const wantStart = Math.max(0, Math.min(before - Math.floor(maxCols / 2), total - maxCols));
  for (let i = 0; i < cps.length; i++) {
    if (acc + widths[i] > wantStart) break;
    acc += widths[i];
    startIdx = i + 1;
  }
  const startCol = acc;
  let out = "";
  let w = 0;
  for (let i = startIdx; i < cps.length; i++) {
    if (w + widths[i] > maxCols) break;
    out += cps[i];
    w += widths[i];
  }
  return { text: out, cursorCol: Math.max(0, before - startCol) };
}

/* ------------------------------------------------------------------ */
/*  Ctrl+C 优雅降级（纯逻辑，单测直测）                                  */
/* ------------------------------------------------------------------ */

export const CTRL_C_WINDOW_MS = 3000;

/** 第一次按 → 记时间返回 false（显示提示）；窗口内再按 → true（退出） */
export function ctrlCPressed(lastAt: number, now: number): boolean {
  return lastAt > 0 && now - lastAt <= CTRL_C_WINDOW_MS;
}

/* ------------------------------------------------------------------ */
/*  交互应用                                                            */
/* ------------------------------------------------------------------ */

/** 渲染节流（≈60fps）：事件再多也合并到一帧 */
const RENDER_THROTTLE_MS = 16;
/** 动画帧间隔：spinner / thinking dots */
const ANIM_MS = 120;

/** resume 选择器条目 */
interface PickerItem {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

/** 可点击区域：渲染时记录屏幕坐标（1-based 物理行列，闭区间），click 事件碰撞检测 */
export interface HitRegion {
  /** 动作语义键（按钮文本 / "pick:N" / "mode"） */
  id: string;
  /** 物理行号（1-based，整屏坐标） */
  row: number;
  /** 起始物理列（1-based，含） */
  colStart: number;
  /** 结束物理列（1-based，含） */
  colEnd: number;
  /** 命中后执行的动作 */
  action: () => void;
}

/** createdAt ISO → 相对时间标签（picker 行尾展示） */
export function agoLabel(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export class TuiApp {
  readonly client: ClientAdapter;
  readonly tracker: RunTracker;
  private screen: Screen;
  private input: InputHandler;
  private sub: SseSubscription | null = null;
  private animTimer: NodeJS.Timeout | null = null;
  private renderTimer: NodeJS.Timeout | null = null;
  private renderScheduled = false;
  private state = new InputState();
  private tick = 0;
  private dirty = true;
  private exiting = false;
  private onExit: (code: number) => void;
  /** Ctrl+C 双击窗口起点（0 = 未按） */
  private ctrlCAt = 0;
  /** 键盘帮助覆盖层（任意键关闭） */
  private overlay: "help" | null = null;
  /** 报告全屏阅读模式 */
  private pager: PagerState | null = null;
  /** :resume 项目选择器 */
  private picker: PickerItem[] | null = null;
  /** 主区域滚动状态（offset=0 跟随底部；>0 回看历史，底行钉提示条） */
  private scroll = createScroll();
  /** 最近一帧的可点击区域（renderNow 重建；click 事件碰撞检测数据源） */
  private hitRegions: HitRegion[] = [];

  constructor(
    readonly url: string,
    mode: "auto" | "manual",
    opts: {
      modelLabel?: string;
      onExit?: (code: number) => void;
      /** Screen 写出口注入（测试静默渲染）；缺省 process.stdout */
      stdoutWrite?: (s: string) => void;
      /** 固定屏幕尺寸（测试坐标确定性）；缺省跟随 TTY */
      screenRows?: number;
      screenCols?: number;
    } = {},
  ) {
    this.client = fetchAdapter(url);
    this.tracker = new RunTracker(mode);
    this.screen = new Screen({
      ...(opts.stdoutWrite !== undefined ? { write: opts.stdoutWrite } : {}),
      ...(opts.screenRows !== undefined && opts.screenCols !== undefined
        ? { rows: opts.screenRows, cols: opts.screenCols }
        : {}),
    });
    this.input = new InputHandler({
      onText: (t) => this.handleKey({ type: "text", text: t }),
      onEnter: () => this.handleKey({ type: "enter" }),
      onEsc: () => this.handleKey({ type: "esc" }),
      onTab: () => this.handleKey({ type: "tab" }),
      onBackspace: () => this.handleKey({ type: "backspace" }),
      onDelete: () => this.handleKey({ type: "delete" }),
      onLeft: () => this.handleKey({ type: "left" }),
      onRight: () => this.handleKey({ type: "right" }),
      onUp: () => this.handleKey({ type: "up" }),
      onDown: () => this.handleKey({ type: "down" }),
      onHome: () => this.handleKey({ type: "home" }),
      onEnd: () => this.handleKey({ type: "end" }),
      onPageUp: () => this.handleKey({ type: "pageup" }),
      onPageDown: () => this.handleKey({ type: "pagedown" }),
      onScroll: (direction) => this.handleKey({ type: "scroll", direction }),
      onClick: (col, row) => this.handleKey({ type: "click", col, row }),
      onCtrlC: () => this.handleKey({ type: "ctrl-c" }),
      onCtrlL: () => this.handleKey({ type: "ctrl-l" }),
    });
    this.modelLabel = opts.modelLabel;
    this.onExit = opts.onExit ?? ((code) => process.exit(code));
  }

  private modelLabel?: string;

  get model() {
    return this.tracker.model;
  }

  /** 主区域可视行数（滚动钳制的视口高度） */
  private viewportRows(): number {
    return this.screen.mainRows;
  }

  /** 半屏滚动步长 */
  private halfPage(): number {
    return Math.max(1, Math.floor(this.viewportRows() / 2));
  }

  /** 当前主区域逻辑行总数（按键即时求值，不依赖节流后的渲染帧） */
  private totalMainLines(): number {
    return renderModel(this.model, Date.now(), this.tick, this.screen.contentCols).length;
  }

  /** 相对滚动主区域（delta>0 回看历史），先按当前 buffer 钳制再移动 */
  private scrollMain(delta: number): void {
    updateTotal(this.scroll, this.totalMainLines(), this.viewportRows());
    scrollBy(this.scroll, delta, this.viewportRows());
  }

  /** 是否有可滚动的主内容（或已在滚动态）——↑/↓ 在滚动与输入历史间切换语义 */
  private canScrollMain(): boolean {
    if (isScrolled(this.scroll)) return true;
    updateTotal(this.scroll, this.totalMainLines(), this.viewportRows());
    return isScrolled(this.scroll) || this.scroll.total > this.viewportRows();
  }

  /* ---------------- 生命周期 ---------------- */

  start(): void {
    this.screen.enter();
    this.renderNow();
    if (process.stdin.isTTY) {
      this.input.start();
    } else {
      // 非 TTY stdin（管道/CI 冒烟）：行模式输入，Esc 用 :stop 替代
      const rl = readline.createInterface({ input: process.stdin, terminal: false });
      rl.on("line", (line) => this.handleLine(line));
    }
    this.animTimer = setInterval(() => {
      this.tick++;
      // 仅在需要动画时标记脏（空闲静态界面不重绘）
      if (this.model.status === "running" || this.model.approval) this.scheduleRender();
    }, ANIM_MS);

    process.on("SIGINT", () => this.quit(130));
    process.on("SIGTERM", () => this.quit(143));
    process.on("exit", () => this.restoreTerminal());
  }

  /** 干净退出：关流 + 恢复终端 + 退出码 */
  quit(code: number): void {
    if (this.exiting) return;
    this.exiting = true;
    this.sub?.close();
    this.input.stop();
    if (this.animTimer) clearInterval(this.animTimer);
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.restoreTerminal();
    this.onExit(code);
  }

  private terminalRestored = false;

  private restoreTerminal(): void {
    if (this.terminalRestored) return;
    this.terminalRestored = true;
    // 关鼠标模式 + 光标可见 + 滚动区复位 + 清屏回顶；raw mode 由 InputHandler.stop 关闭
    process.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1006l\x1b[?25h\x1b[r\x1b[2J\x1b[H");
  }

  /* ---------------- 渲染调度（16ms 节流 + dirty） ---------------- */

  /** 标脏 + 合并渲染：事件风暴被压到 ≤60fps 的帧内，diff 后只写变化行 */
  private scheduleRender(): void {
    this.dirty = true;
    if (this.renderScheduled || this.exiting) return;
    this.renderScheduled = true;
    this.renderTimer = setTimeout(() => {
      this.renderScheduled = false;
      this.renderTimer = null;
      if (this.exiting) return;
      if (this.dirty) {
        this.dirty = false;
        this.renderNow();
      }
    }, RENDER_THROTTLE_MS);
  }

  private renderNow(): void {
    const now = Date.now();
    const cols = this.screen.contentCols;
    const inputView = computeInputView(
      this.state.buf,
      this.state.cursor,
      Math.max(10, this.screen.contentCols - 8),
    );

    if (this.pager) {
      const view = pagerView(this.pager);
      // 底部导航行：可点击的翻页/关闭按钮 + dim 键盘提示
      const lines = [
        "",
        ...view.slice,
        "",
        pagerNavLine(this.pager.page + 1, view.pages),
        "",
        `${ANSI.dim}${view.footer}${ANSI.reset}`,
      ];
      const v = lines.slice(-this.screen.mainRows);
      this.screen.frame({
        title: "PaperFactory Report",
        titleSuffix: "阅读模式",
        mainLines: v,
        status: "点击按钮翻页 · 空格/b/g/G/q 亦可",
        hint: "",
        input: "",
        cursorCol: 0,
      });
      this.rebuildHitRegions(v, null);
      return;
    }

    // 主区域：渲染完整逻辑行 buffer → 同步滚动钳制 → 按偏移切视口（回看时底行钉提示条）
    const base = renderModel(this.model, now, this.tick, cols);
    const rows = this.viewportRows();
    updateTotal(this.scroll, base.length, rows);
    let mainLines = base;
    if (isScrolled(this.scroll)) {
      const { start, end } = viewRange(base.length, this.scroll.offset, Math.max(1, rows - 1));
      mainLines = [...base.slice(start, end), scrollIndicatorLine(start + 1, base.length)];
    }
    let title = "PaperFactory Research Agent";
    if (this.overlay === "help") {
      // 半透明效果：主内容剥色变暗，帮助浮层居中盖在上面
      const dimmed = mainLines.map((l) => `${ANSI.dim}${stripAnsi(l)}${ANSI.reset}`);
      const help = helpOverlayLines(cols);
      const budget = this.screen.mainRows;
      const startRow = Math.max(0, Math.floor((budget - help.length) / 2));
      mainLines = [
        ...dimmed.slice(0, startRow),
        ...help,
        ...dimmed.slice(startRow + help.length),
      ].slice(0, budget);
      title = "Keyboard Shortcuts";
    } else if (this.picker) {
      mainLines = this.pickerLines(cols);
      title = "Resume Project";
    }

    const status = statusLine(this.model, now);
    // 与 Screen.buildRows 相同的视口截断：region 坐标必须与实际显示行一致
    const v = mainLines.slice(-this.screen.mainRows);
    this.screen.frame({
      title,
      titleSuffix: this.modelLabel ? `${this.model.mode} · ${this.modelLabel}` : this.model.mode,
      mainLines: v,
      status,
      hint: promptHint(this.model),
      input: inputView.text,
      cursorCol: inputView.cursorCol,
    });
    this.rebuildHitRegions(v, status, mainLines);
  }

  /* ---------------- 鼠标点击（HitRegion 碰撞检测） ---------------- */

  /**
   * 重建可点击区域。坐标换算（对应 Screen.buildRows 布局）：
   *   主区域 view[j] → 物理行 2+j；逻辑行 display col c → 物理列 3+c（`│ ` 边框前缀 2 列）
   *   状态栏 → 物理行 rows-3（pager 模式传 null 不注册）
   * mainLines 为切片前的完整逻辑行（picker 行号定位用；超屏时头部被切）
   */
  private rebuildHitRegions(view: string[], status: string | null, mainLines: string[] = view): void {
    const regions: HitRegion[] = [];
    for (const span of scanButtons(view)) {
      const action = this.actionForButton(span.text);
      if (action) {
        regions.push({
          id: span.text,
          row: 2 + span.line,
          colStart: 3 + span.colStart,
          colEnd: 3 + span.colEnd,
          action,
        });
      }
    }
    if (this.picker) {
      // picker 项目整行可点（行首数字按钮只是视觉锚点）；行号按视口切片偏移换算
      const cols = this.screen.size().cols;
      const cut = Math.max(0, mainLines.length - view.length);
      this.picker.forEach((_, i) => {
        const logical = 2 + i; // mainLines 内项目行下标（[0]=标题、[1]=空行）
        if (logical < cut) return; // 头部被视口切掉：不可见不注册
        regions.push({
          id: `pick:${i}`,
          row: 2 + logical - cut,
          colStart: 3,
          colEnd: cols - 2,
          action: () => this.pickResume(i),
        });
      });
    }
    if (status !== null) {
      const { rows } = this.screen.size();
      for (const span of scanButtons([status])) {
        if (span.text === "auto" || span.text === "manual") {
          regions.push({
            id: "mode",
            row: rows - 3,
            colStart: 3 + span.colStart,
            colEnd: 3 + span.colEnd,
            action: () => this.toggleMode(),
          });
        }
      }
    }
    this.hitRegions = regions;
  }

  /** 按钮文本 → 动作（审批/展开/回底/翻页/关闭/切模式/picker 数字） */
  private actionForButton(text: string): (() => void) | null {
    switch (text) {
      case "✓ 批准":
        return this.model.approval ? () => void this.decide("approve") : null;
      case "✎ 修改":
        return this.model.approval ? () => void this.decide("modify") : null;
      case "✗ 拒绝":
        return this.model.approval ? () => void this.decide("reject") : null;
      case "▼ 展开详情":
      case "▲ 收起详情":
        return () => {
          if (this.tracker.toggleApprovalDetail()) snapToBottom(this.scroll);
        };
      case "回到底部":
        return () => snapToBottom(this.scroll);
      case "← 上一页":
        return this.pager ? () => pagerMove(this.pager as PagerState, "prev") : null;
      case "下一页 →":
        return this.pager ? () => pagerMove(this.pager as PagerState, "next") : null;
      case "✕ 关闭":
        return this.pager ? () => this.closePager() : null;
      case "关闭":
        return this.overlay === "help"
          ? () => {
              this.overlay = null;
              this.screen.invalidate();
            }
          : null;
      default: {
        const n = Number.parseInt(text, 10);
        if (Number.isInteger(n) && n >= 1) return () => this.pickResume(n - 1);
        return null;
      }
    }
  }

  /** click 事件入口：命中区域执行动作；未命中按区域语义降级 */
  private handleClick(col: number, row: number): void {
    const hit = this.hitRegions.find((r) => r.row === row && col >= r.colStart && col <= r.colEnd);
    if (hit) {
      hit.action();
      this.scheduleRender();
      return;
    }
    if (this.overlay) {
      // 帮助层：点击任意处关闭（同任意键关闭）
      this.overlay = null;
      this.screen.invalidate();
      this.scheduleRender();
      return;
    }
    const { rows } = this.screen.size();
    if (this.pager || this.picker) return; // 阅读模式/选择器空白处点击不误触
    if (row === rows - 1) {
      // 输入行：聚焦输入（回底跟随输出）
      snapToBottom(this.scroll);
      this.scheduleRender();
      return;
    }
    if (row >= 2 && row <= rows - 4) {
      // 主区域空白：进入滚动回看
      this.scrollMain(1);
      this.scheduleRender();
    }
  }

  private pickerLines(cols: number): string[] {
    if (!this.picker) return [];
    const lines: string[] = [
      `${ANSI.bold}${ANSI.cyan}  选择要恢复的项目${ANSI.reset}  ${ANSI.dim}（点击项目或数字键选择 · q 取消）${ANSI.reset}`,
      "",
    ];
    // 视口内最多放 mainRows-2 个项目：标题行恒可见，且与 HitRegion 行号假设一致
    const maxItems = Math.max(1, this.screen.mainRows - 2);
    this.picker.slice(0, maxItems).forEach((p, i) => {
      const num = button(String(i + 1));
      const ago = agoLabel(p.createdAt);
      lines.push(
        `  ${num} ${ANSI.gray}${p.id.slice(0, 8)}${ANSI.reset} ${p.status.padEnd(8)} ${truncate(p.name, Math.max(10, cols - 40))}${ANSI.dim}${ago ? ` (${ago})` : ""}${ANSI.reset}`,
      );
    });
    return lines;
  }

  /** picker 项目选择（数字键与点击共用）：关闭选择器并发起 resume */
  private pickResume(i: number): void {
    const item = this.picker?.[i];
    if (!item) return;
    this.picker = null;
    this.screen.invalidate();
    void this.resumeRun(item.id);
  }

  /* ---------------- 按键总路由 ---------------- */

  /** 统一按键入口（InputHandler 回调与非 TTY 行模式共用；覆盖层优先级最高） */
  handleKey(key: Key): void {
    // Ctrl+C 永远可达（防止覆盖层里卡死），走双击降级
    if (key.type === "ctrl-c") {
      this.onCtrlC();
      return;
    }
    if (key.type === "ctrl-l") {
      this.screen.invalidate();
      this.scheduleRender();
      return;
    }
    // 鼠标点击统一走 HitRegion 碰撞检测（region 已按当前模式构建）
    if (key.type === "click") {
      this.handleClick(key.col, key.row);
      return;
    }
    if (this.pager) {
      this.pagerKey(key);
      return;
    }
    if (this.picker) {
      this.pickerKey(key);
      return;
    }
    if (this.overlay) {
      // 帮助覆盖层：任意键关闭
      this.overlay = null;
      this.scheduleRender();
      return;
    }
    this.routeKey(key);
  }

  /** 主界面按键（输入编辑 / 提交 / 历史翻阅） */
  private routeKey(key: Key): void {
    switch (key.type) {
      case "text":
        this.onText(key.text);
        break;
      case "enter":
        this.onSubmit();
        break;
      case "esc":
        void this.stopRun();
        break;
      case "tab":
        this.toggleMode();
        this.scheduleRender();
        break;
      case "backspace":
        this.state.backspace();
        this.scheduleRender();
        break;
      case "delete":
        this.state.deleteForward();
        this.scheduleRender();
        break;
      case "left":
        this.state.move(-1);
        this.scheduleRender();
        break;
      case "right":
        this.state.move(1);
        this.scheduleRender();
        break;
      case "up":
        // 主内容可滚动时 ↑ 回看历史；不满一屏时保留输入历史语义
        if (this.canScrollMain()) this.scrollMain(1);
        else this.state.prevHistory();
        this.scheduleRender();
        break;
      case "down":
        if (isScrolled(this.scroll)) this.scrollMain(-1);
        else this.state.nextHistory();
        this.scheduleRender();
        break;
      case "home":
        this.state.home();
        this.scheduleRender();
        break;
      case "end":
        // 回看时 End 跳回底部恢复跟随；否则输入光标行尾
        if (isScrolled(this.scroll)) snapToBottom(this.scroll);
        else this.state.end();
        this.scheduleRender();
        break;
      case "pageup":
        this.scrollMain(this.halfPage());
        this.scheduleRender();
        break;
      case "pagedown":
        this.scrollMain(-this.halfPage());
        this.scheduleRender();
        break;
      case "scroll":
        // 鼠标滚轮：只滚主区域（不触发输入历史浏览），到底/到顶自然钳制
        this.scrollMain(key.direction === "up" ? 1 : -1);
        this.scheduleRender();
        break;
      default:
        break; // ignored / click（click 在 handleKey 顶部统一处理）主界面无操作
    }
  }

  /** auto/manual 切换（Tab 与状态栏点击共用；下一 run 生效） */
  private toggleMode(): void {
    this.model.mode = this.model.mode === "auto" ? "manual" : "auto";
    this.tracker.setNotice(`模式已切换为 ${this.model.mode}（下一个 run 生效）`);
  }

  private onText(text: string): void {
    // 审批等待：单键 a/m/r/d 直达（不进输入缓冲）
    if (this.model.approval && /^[amrd]$/.test(text)) {
      if (text === "d") {
        if (this.tracker.toggleApprovalDetail()) {
          snapToBottom(this.scroll); // 详情卡片在底部，展开时回到可视区
          this.scheduleRender();
        }
        return;
      }
      void this.decide(text === "a" ? "approve" : text === "m" ? "modify" : "reject");
      return;
    }
    // 空输入时 `?` 打开帮助覆盖层（非空时是普通文本）
    if (text === "?" && this.state.buf === "") {
      this.overlay = "help";
      this.scheduleRender();
      return;
    }
    // 空输入 + 空闲 + 已有报告：`r` 进入阅读模式
    if (text === "r" && this.state.buf === "" && this.model.reportLines && !this.model.approval && this.model.status !== "running") {
      this.openPager();
      return;
    }
    this.state.insert(text);
    // 开始打字 = 输入行获得焦点：跳回底部恢复自动跟随
    snapToBottom(this.scroll);
    this.scheduleRender();
  }

  /** Ctrl+C 优雅降级：第一次提示，3 秒内第二次退出 */
  private onCtrlC(): void {
    const now = Date.now();
    if (ctrlCPressed(this.ctrlCAt, now)) {
      this.quit(130);
      return;
    }
    this.ctrlCAt = now;
    this.tracker.setNotice("再按一次 Ctrl+C 退出（3 秒内）");
    this.scheduleRender();
    const at = now;
    setTimeout(() => {
      // 提示自动消退（未被第二次按下覆盖时）
      if (!this.exiting && this.ctrlCAt === at) {
        this.ctrlCAt = 0;
        this.tracker.setNotice(undefined);
        this.scheduleRender();
      }
    }, CTRL_C_WINDOW_MS + 200);
  }

  /* ---------------- 报告阅读模式 ---------------- */

  private openPager(): void {
    const raw = this.rawReport;
    if (!raw) {
      this.tracker.setNotice("报告尚未就绪（run 完成后自动拉取）");
      this.scheduleRender();
      return;
    }
    const rows = Math.max(4, this.screen.size().rows - 6);
    this.pager = createPager(renderMarkdown(raw, 400), rows);
    this.screen.invalidate();
    this.scheduleRender();
  }

  private closePager(): void {
    this.pager = null;
    this.screen.invalidate();
    this.scheduleRender();
  }

  private rawReport: string | null = null;

  private pagerKey(key: Key): void {
    const pager = this.pager;
    if (!pager) return;
    switch (key.type) {
      case "text":
        switch (key.text) {
          case " ":
            if (pagerView(pager).atEnd) this.closePager();
            else pagerMove(pager, "next");
            break;
          case "b":
            pagerMove(pager, "prev");
            break;
          case "j":
            pagerMove(pager, "next");
            break;
          case "k":
            pagerMove(pager, "prev");
            break;
          case "g":
            pagerMove(pager, "first");
            break;
          case "G":
            pagerMove(pager, "last");
            break;
          case "q":
            this.closePager();
            break;
          default:
            break;
        }
        break;
      case "enter":
      case "pagedown":
        pagerMove(pager, "next");
        break;
      case "pageup":
        pagerMove(pager, "prev");
        break;
      case "up":
        pagerMove(pager, "prev");
        break;
      case "down":
        pagerMove(pager, "next");
        break;
      case "scroll":
        pagerMove(pager, key.direction === "up" ? "prev" : "next");
        break;
      case "home":
        pagerMove(pager, "first");
        break;
      case "end":
        pagerMove(pager, "last");
        break;
      case "esc":
        this.closePager();
        break;
      default:
        break;
    }
    this.scheduleRender();
  }

  /* ---------------- resume 选择器 ---------------- */

  /** 拉最近项目列表并打开数字选择器（:resume 无参数 / --resume 入口） */
  async openResumePicker(): Promise<void> {
    try {
      const projects = await getProjects(this.client);
      if (projects.length === 0) {
        this.tracker.setNotice("没有可恢复的项目（先跑一次研究）");
        this.scheduleRender();
        return;
      }
      this.picker = projects.slice(0, 9).map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        createdAt: p.createdAt,
      }));
      this.screen.invalidate();
      this.scheduleRender();
    } catch (err) {
      this.tracker.setNotice(`项目列表拉取失败: ${String(err).slice(0, 80)}`);
      this.scheduleRender();
    }
  }

  private pickerKey(key: Key): void {
    if (key.type === "esc") {
      this.picker = null;
      this.screen.invalidate();
      this.scheduleRender();
      return;
    }
    if (key.type === "text") {
      if (key.text === "q") {
        this.picker = null;
        this.screen.invalidate();
        this.scheduleRender();
        return;
      }
      const n = Number.parseInt(key.text, 10);
      if (Number.isInteger(n) && n >= 1 && n <= (this.picker?.length ?? 0)) {
        this.pickResume(n - 1);
        return;
      }
    }
  }

  /* ---------------- 提交 ---------------- */

  private onSubmit(): void {
    this.submit(this.state.commit());
    snapToBottom(this.scroll); // 发送后回到底部跟随输出
    this.scheduleRender();
  }

  /** 行输入统一入口（raw 模式 Enter 与非 TTY readline 共用） */
  private submit(text: string): void {
    const line = text.trim();
    if (!line) return;
    if (line.startsWith(":")) {
      void this.command(line);
      return;
    }
    if (this.model.approval) {
      this.tracker.setNotice("审批等待中：先按 a/m/r 处理当前审批");
      return;
    }
    if (this.model.status === "running") {
      this.tracker.enqueueQuestion(line);
      return;
    }
    void this.startRun(line);
  }

  private handleLine(line: string): void {
    // 非 TTY 行模式：Tab 无法输入（用 :mode 切换），Esc 用 :stop 替代
    this.submit(line);
    this.scheduleRender();
  }

  /* ---------------- 命令 ---------------- */

  private async command(line: string): Promise<void> {
    const [cmd, ...rest] = line.slice(1).trim().split(/\s+/);
    switch (cmd) {
      case "help":
      case "?":
        this.overlay = "help";
        break;
      case "mode": {
        const m = rest[0];
        if (m === "auto" || m === "manual") this.model.mode = m;
        this.tracker.setNotice(`当前模式 ${this.model.mode}${rest[0] === this.model.mode ? "（下一个 run 生效）" : ""}`);
        break;
      }
      case "chain": {
        const [objectType, objectId] = rest;
        if (!objectType || !objectId || !this.model.projectId) {
          this.tracker.setNotice("用法: :chain <objectType> <objectId>（需先有一次 run 建立 project 上下文）");
          break;
        }
        try {
          const chain = await getEvidenceChain(this.client, this.model.projectId, objectType, objectId);
          const lines = [`${ANSI.bold}⛓ chain ${objectType}/${objectId.slice(0, 8)}${ANSI.reset}`];
          for (const up of chain.upstream ?? []) lines.push(`  ↑ ${up.targetType}/${String(up.targetId).slice(0, 8)} (${up.relation})`);
          for (const down of chain.downstream ?? []) lines.push(`  ↓ ${down.sourceType}/${String(down.sourceId).slice(0, 8)} (${down.relation})`);
          this.model.epilogue.push(...lines);
          this.tracker.setNotice(undefined);
        } catch (err) {
          this.tracker.setNotice(`chain 查询失败: ${String(err).slice(0, 80)}`);
        }
        break;
      }
      case "resume": {
        const projectId = rest[0];
        if (!projectId) {
          await this.openResumePicker();
          break;
        }
        await this.resumeRun(projectId);
        break;
      }
      case "report":
        this.openPager();
        break;
      case "stop":
        await this.stopRun();
        break;
      case "clear":
        this.tracker.reset();
        this.tracker.setNotice(undefined);
        snapToBottom(this.scroll);
        this.screen.invalidate();
        break;
      case "quit":
      case "exit":
        this.quit(0);
        break;
      default:
        this.tracker.setNotice(`未知命令 :${cmd}（:help 查看命令列表）`);
    }
    this.scheduleRender();
  }

  /* ---------------- run 生命周期 ---------------- */

  async startRun(question: string): Promise<void> {
    this.tracker.reset(); // reset 保留 mode + queued
    snapToBottom(this.scroll);
    this.model.status = "running";
    this.model.question = question;
    this.model.startedAt = Date.now();
    this.tracker.setNotice(undefined);
    this.scheduleRender();
    try {
      const res = await startResearch(this.client, { question, mode: this.model.mode });
      this.model.runId = res.runId;
      this.model.projectId = res.projectId;
      this.ensureSubscribed(res.projectId);
      this.scheduleRender();
    } catch (err) {
      this.model.status = "error";
      this.tracker.setNotice(`发起研究失败: ${String(err).slice(0, 100)}`);
      this.scheduleRender();
    }
  }

  async resumeRun(projectId: string): Promise<void> {
    this.tracker.reset();
    snapToBottom(this.scroll);
    this.model.status = "running";
    this.model.projectId = projectId;
    this.model.startedAt = Date.now();
    this.tracker.setNotice(undefined);
    this.scheduleRender();
    try {
      const res = await resumeResearch(this.client, { projectId });
      this.model.runId = res.runId;
      this.model.question = `:resume ${projectId}（自 ${res.resumeFromPhase ?? "起点"} 续跑）`;
      this.ensureSubscribed(res.projectId);
      this.scheduleRender();
    } catch (err) {
      this.model.status = "error";
      this.tracker.setNotice(`恢复失败: ${String(err).slice(0, 100)}`);
      this.scheduleRender();
    }
  }

  private ensureSubscribed(projectId: string): void {
    this.sub?.close();
    this.sub = subscribeSse(
      this.url,
      (event) => this.onEvent(event),
      {
        projectId,
        lastEventId: 0,
        onStatus: (status, detail) => {
          if (status === "reconnecting") this.tracker.setNotice(`SSE 重连中${detail ? `: ${detail.slice(0, 60)}` : ""}`);
          this.scheduleRender();
        },
      },
    );
  }

  private onEvent(event: DomainEvent): void {
    if (event.type === "stream:ready") return;
    if (event.projectId && this.model.projectId && event.projectId !== this.model.projectId) return;
    const runId = this.model.runId;
    this.tracker.handle(event);
    this.scheduleRender();

    if (event.type === "run:complete") {
      if (this.model.notice === "正在停止 run…") this.tracker.setNotice(undefined);
      void this.fetchReport(runId);
      this.maybeSendQueued();
    } else if (event.type === "run:error") {
      if (this.model.notice === "正在停止 run…") this.tracker.setNotice(undefined);
      this.maybeSendQueued();
    }
  }

  /** 上一轮结束：取出最早排队的问题自动开新 run（FIFO） */
  private maybeSendQueued(): void {
    const q = this.tracker.dequeueQuestion();
    if (!q) return;
    setTimeout(() => {
      if (!this.exiting && this.model.status !== "running") void this.startRun(q);
    }, 400);
  }

  async stopRun(): Promise<void> {
    if (this.model.status !== "running" || !this.model.runId) {
      this.tracker.setNotice("当前没有运行中的 run");
      this.scheduleRender();
      return;
    }
    const runId = this.model.runId;
    this.tracker.setNotice("正在停止 run…");
    this.scheduleRender();
    try {
      await stopResearchRun(this.client, runId);
    } catch (err) {
      this.tracker.setNotice(`停止请求失败: ${String(err).slice(0, 80)}`);
      this.scheduleRender();
    }
  }

  /* ---------------- 审批 ---------------- */

  async decide(decision: Decision): Promise<void> {
    const approval = this.model.approval;
    if (!approval || !this.model.projectId) return;
    try {
      await submitPhaseDecision(this.client, this.model.projectId, approval.phaseRunId, { decision });
      this.tracker.resolveApproval(decision);
      this.tracker.setNotice(undefined);
    } catch (err) {
      this.tracker.setNotice(`审批提交失败: ${String(err).slice(0, 80)}`);
    }
    snapToBottom(this.scroll); // 审批完成后跟随后续输出
    this.scheduleRender();
  }

  /* ---------------- 报告 ---------------- */

  private async fetchReport(runId: string | undefined): Promise<void> {
    const projectId = this.model.projectId;
    if (!projectId) return;
    try {
      const reports = await getProjectReports(this.client, projectId);
      const latest = reports[reports.length - 1];
      if (!latest) return;
      const raw =
        (typeof latest.content === "string" && latest.content) ||
        (latest.data as { content?: unknown } | undefined)?.content;
      if (typeof raw !== "string" || !raw) return;
      if (this.model.runId !== runId || this.exiting) return; // run 已被替换
      // 报告 content 是 report_generation 的 JSON 输出（{abstract,sections}）——解析成可读 Markdown
      const readable = parseReportContent(raw);
      this.rawReport = readable;
      this.model.reportLines = [
        "",
        `${ANSI.dim}── report (${stripAnsi(readable).split("\n").length} lines · 按 r 全屏阅读) ──${ANSI.reset}`,
        ...renderMarkdown(readable),
      ];
      this.scheduleRender();
    } catch {
      // 报告拉取失败不打断主流程
    }
  }
}

/* ------------------------------------------------------------------ */
/*  main                                                               */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    await listProjects(args.url);
    return;
  }

  const url = args.url.replace(/\/$/, "");
  const app = new TuiApp(url, args.mode, { modelLabel: args.modelLabel });
  app.start();

  if (args.resume) {
    void app.openResumePicker();
  }

  if (args.question) {
    // 一次性模式：完成/超时即退出
    let settled = false;
    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      setTimeout(() => app.quit(code), 600); // 留一帧渲染终态
    };
    const check = (): void => {
      const status = app.model.status;
      if (status === "complete") finish(0);
      else if (status === "error" || status === "stopped") finish(1);
      else setTimeout(check, 300);
    };
    void app.startRun(args.question).then(() => check());
    setTimeout(() => {
      app.tracker.setNotice(`[timeout after ${args.timeoutMs}ms — 退出]`);
      finish(app.model.status === "complete" ? 0 : 1);
    }, args.timeoutMs).unref?.();
  }
  // 交互模式：事件驱动，不阻塞 main 返回（进程由 quit() 退出）
}

/** 仅作为入口脚本直接执行时跑 CLI（vitest import 不触发） */
if (process.argv[1] !== undefined && process.argv[1].includes("packages/tui/src/index.ts")) {
  main().catch((err) => {
    process.stdout.write("\x1b[?25h\x1b[r\x1b[2J\x1b[H"); // 异常路径也恢复终端
    console.error(`pf-tui: ${String(err).slice(0, 300)}`);
    process.exit(1);
  });
}

export { main, PHASE_ORDER, splitAtDisplay };
