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
 *       ↑/↓ 输入历史 · ←/→ Home/End 光标移动 · r 报告阅读 · ? 帮助覆盖层
 * 审批等待时：a 批准 / m 修改 / r 拒绝
 * 命令：:help :mode :chain <objectType> <objectId> :resume <projectId> :report :stop :clear :quit
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
  ANSI,
  PHASE_ORDER,
  helpOverlayLines,
  promptHint,
  renderMarkdown,
  renderModel,
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

  constructor(
    readonly url: string,
    mode: "auto" | "manual",
    opts: { modelLabel?: string; onExit?: (code: number) => void } = {},
  ) {
    this.client = fetchAdapter(url);
    this.tracker = new RunTracker(mode);
    this.screen = new Screen();
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
    // 光标可见 + 滚动区复位 + 清屏回顶；raw mode 由 InputHandler.stop 关闭
    process.stdout.write("\x1b[?25h\x1b[r\x1b[2J\x1b[H");
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
      this.screen.frame({
        title: "PaperFactory Report",
        titleSuffix: "阅读模式",
        mainLines: ["", ...view.slice, "", `${ANSI.dim}${view.footer}${ANSI.reset}`],
        status: "空格 下一页 · b 上一页 · g/G 首末页 · q 退出",
        hint: "",
        input: "",
        cursorCol: 0,
      });
      return;
    }

    let mainLines = renderModel(this.model, now, this.tick, cols);
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

    this.screen.frame({
      title,
      titleSuffix: this.modelLabel ? `${this.model.mode} · ${this.modelLabel}` : this.model.mode,
      mainLines,
      status: statusLine(this.model, now),
      hint: promptHint(this.model),
      input: inputView.text,
      cursorCol: inputView.cursorCol,
    });
  }

  private pickerLines(cols: number): string[] {
    if (!this.picker) return [];
    const lines: string[] = [
      `${ANSI.bold}${ANSI.cyan}  选择要恢复的项目${ANSI.reset}  ${ANSI.dim}（数字键选择 · q 取消）${ANSI.reset}`,
      "",
    ];
    this.picker.forEach((p, i) => {
      const num = `${ANSI.yellow}${i + 1}${ANSI.reset}`;
      lines.push(
        `  ${num} ${ANSI.gray}${p.id.slice(0, 8)}${ANSI.reset} ${p.status.padEnd(8)} ${truncate(p.name, Math.max(10, cols - 30))}`,
      );
    });
    return lines;
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
        this.model.mode = this.model.mode === "auto" ? "manual" : "auto";
        this.tracker.setNotice(`模式已切换为 ${this.model.mode}（下一个 run 生效）`);
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
        this.state.prevHistory();
        this.scheduleRender();
        break;
      case "down":
        this.state.nextHistory();
        this.scheduleRender();
        break;
      case "home":
        this.state.home();
        this.scheduleRender();
        break;
      case "end":
        this.state.end();
        this.scheduleRender();
        break;
      default:
        break; // pageup/pagedown/ignored 主界面无操作
    }
  }

  private onText(text: string): void {
    // 审批等待：单键 a/m/r 直达（不进输入缓冲）
    if (this.model.approval && /^[amr]$/.test(text)) {
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
      if (Number.isInteger(n) && n >= 1 && this.picker && n <= this.picker.length) {
        const item = this.picker[n - 1];
        this.picker = null;
        this.screen.invalidate();
        void this.resumeRun(item.id);
        return;
      }
    }
  }

  /* ---------------- 提交 ---------------- */

  private onSubmit(): void {
    this.submit(this.state.commit());
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
      this.rawReport = raw;
      this.model.reportLines = [
        "",
        `${ANSI.dim}── report (${stripAnsi(raw).split("\n").length} lines · 按 r 全屏阅读) ──${ANSI.reset}`,
        ...renderMarkdown(raw),
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
