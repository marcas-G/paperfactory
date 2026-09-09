#!/usr/bin/env node
/**
 * pf-tui —— OpenCode 风格终端客户端（纯 ANSI + @pf/client SDK + SSE，零新依赖）。
 *
 * 用法：
 *   pf-tui                                        # 交互模式（默认）
 *   pf-tui "研究问题"                              # 一次性研究，完成即退出
 *   pf-tui --list
 *
 * 按键：Enter 发送/排队 · Esc 停止 run · Tab 切 auto/manual · Ctrl+C 退出
 * 审批等待时：a 批准 / m 修改 / r 拒绝
 * 命令：:help :mode :chain <objectType> <objectId> :resume <projectId> :stop :clear :quit
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
import { InputHandler } from "./input";
import { Screen } from "./screen";
import { RunTracker, type Decision } from "./stream";
import {
  ANSI,
  PHASE_ORDER,
  promptHint,
  renderMarkdown,
  renderModel,
  statusLine,
  stripAnsi,
  truncate,
} from "./render";

/* ------------------------------------------------------------------ */
/*  CLI 参数                                                            */
/* ------------------------------------------------------------------ */

interface CliArgs {
  question?: string;
  url: string;
  list: boolean;
  timeoutMs: number;
  mode: "auto" | "manual";
  modelLabel?: string;
}

const HELP = `pf-tui — PaperFactory terminal client (OpenCode-style)

用法:
  pf-tui                                          交互模式
  pf-tui "<研究问题>"                              一次性研究（完成即退出）
  pf-tui --list                                   列出项目

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
    timeoutMs: 30_000,
    mode: "auto",
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") args.list = true;
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
/*  交互应用                                                            */
/* ------------------------------------------------------------------ */

const REPAINT_MS = 120;

export class TuiApp {
  readonly client: ClientAdapter;
  readonly tracker: RunTracker;
  private screen: Screen;
  private input: InputHandler;
  private sub: SseSubscription | null = null;
  private timer: NodeJS.Timeout | null = null;
  private inputBuf = "";
  private queued: string | null = null;
  private tick = 0;
  private dirty = true;
  private exiting = false;
  private onExit: (code: number) => void;

  constructor(
    readonly url: string,
    mode: "auto" | "manual",
    opts: { modelLabel?: string; onExit?: (code: number) => void } = {},
  ) {
    this.client = fetchAdapter(url);
    this.tracker = new RunTracker(mode);
    this.screen = new Screen();
    this.input = new InputHandler({
      onText: (t) => this.onText(t),
      onEnter: () => this.onEnter(),
      onEsc: () => this.onEsc(),
      onTab: () => this.onTab(),
      onBackspace: () => this.onBackspace(),
      onCtrlC: () => this.quit(0),
      onCtrlL: () => {
        this.dirty = true;
      },
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
    this.frame();
    if (process.stdin.isTTY) {
      this.input.start();
    } else {
      // 非 TTY stdin（管道/CI 冒烟）：行模式输入，Esc 用 :stop 替代
      const rl = readline.createInterface({ input: process.stdin, terminal: false });
      rl.on("line", (line) => this.handleLine(line));
    }
    this.timer = setInterval(() => {
      this.tick++;
      if (this.dirty || this.model.status === "running" || this.model.approval) {
        this.dirty = false;
        this.frame();
      }
    }, REPAINT_MS);

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
    if (this.timer) clearInterval(this.timer);
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

  /* ---------------- 渲染 ---------------- */

  private frame(): void {
    const now = Date.now();
    this.screen.frame({
      title: "PaperFactory Research Agent",
      titleSuffix: this.modelLabel ? `${this.model.mode} · ${this.modelLabel}` : this.model.mode,
      mainLines: renderModel(this.model, now, this.tick, this.screen.contentCols),
      status: statusLine(this.model, now),
      hint: promptHint(this.model),
      input: this.inputBuf,
    });
  }

  private touch(): void {
    this.dirty = true;
  }

  /* ---------------- 按键 ---------------- */

  private onText(text: string): void {
    // 审批等待：单键 a/m/r 直达（不进输入缓冲）
    if (this.model.approval && /^[amr]$/.test(text)) {
      void this.decide(text === "a" ? "approve" : text === "m" ? "modify" : "reject");
      return;
    }
    this.inputBuf = truncate(this.inputBuf + text, 200);
    this.touch();
  }

  private onBackspace(): void {
    this.inputBuf = this.inputBuf.slice(0, -1);
    this.touch();
  }

  private onTab(): void {
    this.model.mode = this.model.mode === "auto" ? "manual" : "auto";
    this.tracker.setNotice(`模式已切换为 ${this.model.mode}（下一个 run 生效）`);
    this.touch();
  }

  private onEsc(): void {
    void this.stopRun();
  }

  private onEnter(): void {
    this.submit(this.inputBuf);
    this.inputBuf = "";
    this.touch();
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
      this.queued = line;
      this.tracker.setNotice("已排队：当前运行结束后自动发送");
      return;
    }
    void this.startRun(line);
  }

  private handleLine(line: string): void {
    // 非 TTY 行模式：Tab 无法输入（用 :mode 切换），Esc 用 :stop 替代
    this.submit(line);
  }

  /* ---------------- 命令 ---------------- */

  private async command(line: string): Promise<void> {
    const [cmd, ...rest] = line.slice(1).trim().split(/\s+/);
    switch (cmd) {
      case "help":
      case "?":
        this.tracker.setNotice(":chain <objectType> <objectId> · :resume <projectId> · :mode auto|manual · :stop · :clear · :quit");
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
          this.tracker.setNotice("用法: :resume <projectId>");
          break;
        }
        await this.resumeRun(projectId);
        break;
      }
      case "stop":
        await this.stopRun();
        break;
      case "clear":
        this.tracker.reset();
        this.tracker.setNotice(undefined);
        break;
      case "quit":
      case "exit":
        this.quit(0);
        break;
      default:
        this.tracker.setNotice(`未知命令 :${cmd}（:help 查看命令列表）`);
    }
    this.touch();
  }

  /* ---------------- run 生命周期 ---------------- */

  async startRun(question: string): Promise<void> {
    this.tracker.reset(); // reset 保留 mode
    this.model.status = "running";
    this.model.question = question;
    this.model.startedAt = Date.now();
    this.tracker.setNotice(undefined);
    this.touch();
    try {
      const res = await startResearch(this.client, { question, mode: this.model.mode });
      this.model.runId = res.runId;
      this.model.projectId = res.projectId;
      this.ensureSubscribed(res.projectId);
      this.touch();
    } catch (err) {
      this.model.status = "error";
      this.tracker.setNotice(`发起研究失败: ${String(err).slice(0, 100)}`);
      this.touch();
    }
  }

  async resumeRun(projectId: string): Promise<void> {
    this.tracker.reset();
    this.model.status = "running";
    this.model.projectId = projectId;
    this.model.startedAt = Date.now();
    this.tracker.setNotice(undefined);
    this.touch();
    try {
      const res = await resumeResearch(this.client, { projectId });
      this.model.runId = res.runId;
      this.model.question = `:resume ${projectId}（自 ${res.resumeFromPhase ?? "起点"} 续跑）`;
      this.ensureSubscribed(res.projectId);
      this.touch();
    } catch (err) {
      this.model.status = "error";
      this.tracker.setNotice(`恢复失败: ${String(err).slice(0, 100)}`);
      this.touch();
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
          this.touch();
        },
      },
    );
  }

  private onEvent(event: DomainEvent): void {
    if (event.type === "stream:ready") return;
    if (event.projectId && this.model.projectId && event.projectId !== this.model.projectId) return;
    const runId = this.model.runId;
    this.tracker.handle(event);
    this.dirty = true;

    if (event.type === "run:complete") {
      if (this.model.notice === "正在停止 run…") this.tracker.setNotice(undefined);
      void this.fetchReport(runId);
      this.maybeSendQueued();
    } else if (event.type === "run:error") {
      if (this.model.notice === "正在停止 run…") this.tracker.setNotice(undefined);
      this.maybeSendQueued();
    }
  }

  private maybeSendQueued(): void {
    if (!this.queued) return;
    const q = this.queued;
    this.queued = null;
    setTimeout(() => {
      if (!this.exiting && this.model.status !== "running") void this.startRun(q);
    }, 400);
  }

  async stopRun(): Promise<void> {
    if (this.model.status !== "running" || !this.model.runId) {
      this.tracker.setNotice("当前没有运行中的 run");
      this.touch();
      return;
    }
    const runId = this.model.runId;
    this.tracker.setNotice("正在停止 run…");
    this.touch();
    try {
      await stopResearchRun(this.client, runId);
    } catch (err) {
      this.tracker.setNotice(`停止请求失败: ${String(err).slice(0, 80)}`);
      this.touch();
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
    this.touch();
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
      this.model.reportLines = [
        "",
        `${ANSI.dim}── report (${stripAnsi(raw).split("\n").length} lines) ──${ANSI.reset}`,
        ...renderMarkdown(raw),
      ];
      this.dirty = true;
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

export { main, PHASE_ORDER };
