#!/usr/bin/env node
/**
 * pf-tui —— 终端客户端（多端协议验证：与 Web 共用 @pf/client SDK + /api/events SSE）。
 *
 * 用法：
 *   pf-tui "研究问题" [--url http://localhost:3001] [--timeout 30000]
 *   pf-tui --list [--url ...]
 *
 * 纯客户端：命令走生成 SDK（fetchAdapter），事件走本包 sse.ts 的 fetch 读流，
 * 不 import server/core 内部模块。
 */
import { fetchAdapter, getProjects, getProjectReports, startResearch } from "@pf/client";
import type { DomainEvent } from "@pf/client";
import { subscribeSse } from "./sse";
import {
  childBody,
  childLine,
  phaseCompleteLine,
  phaseHeaderLine,
  runCompleteLine,
  runErrorLine,
  runStartLine,
} from "./render";

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

interface CliArgs {
  question?: string;
  url: string;
  list: boolean;
  timeoutMs: number;
}

const HELP = `pf-tui — PaperFactory terminal client

用法:
  pf-tui "<研究问题>" [--url http://localhost:3001] [--timeout 30000]
  pf-tui --list [--url ...]

选项:
  --url <base>    API 根地址（默认 http://localhost:3001）
  --list          列出项目
  --timeout <ms>  最长等待事件时间（默认 30000）
  -h, --help      帮助`;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { url: process.env.PF_URL ?? "http://localhost:3001", list: false, timeoutMs: 30_000 };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") args.list = true;
    else if (a === "--url") args.url = argv[++i] ?? args.url;
    else if (a === "--timeout") args.timeoutMs = Number(argv[++i] ?? 30_000) || 30_000;
    else if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    } else positional.push(a);
  }
  args.question = positional.join(" ").trim() || undefined;
  return args;
}

/** ANSI 着色（非 TTY 时原样输出，重定向到文件保持纯文本） */
function colorize(line: string): string {
  if (!process.stdout.isTTY) return line;
  if (line.startsWith("●")) {
    if (line.includes("✗") || line.includes("run:error")) return RED + line + RESET;
    if (line.includes("✓") || line.includes("run:start")) return GREEN + line + RESET;
    return BOLD + line + RESET;
  }
  if (line.startsWith("│")) return DIM + line + RESET;
  if (line.startsWith("  reports →")) return DIM + line + RESET;
  return line;
}

function print(line: string): void {
  process.stdout.write(colorize(line) + "\n");
}

/** 项目列表视图 */
async function listProjects(url: string): Promise<void> {
  const client = fetchAdapter(url);
  const projects = await getProjects(client);
  if (projects.length === 0) {
    console.log(`no projects (${url})`);
    return;
  }
  print(`${BOLD}projects${RESET} (${projects.length}) @ ${url}`);
  for (const p of projects) {
    print(`  ${p.id.slice(0, 8)}  ${p.status.padEnd(10)} ${p.createdAt.slice(0, 19)}  ${p.name}`);
  }
}

/** run 结束后拉最新报告，打印前 30 行 */
async function showLatestReport(url: string, projectId: string): Promise<void> {
  try {
    const client = fetchAdapter(url);
    const reports = await getProjectReports(client, projectId);
    const latest = reports[reports.length - 1];
    if (!latest) {
      print(`${DIM}  (no report yet)${RESET}`);
      return;
    }
    const raw =
      (typeof latest.content === "string" && latest.content) ||
      (latest.data as { content?: unknown } | undefined)?.content;
    const content = typeof raw === "string" ? raw : JSON.stringify(latest, null, 2);
    print(`${DIM}  --- report (first 30 lines) ---${RESET}`);
    for (const line of content.split("\n").slice(0, 30)) {
      print(`${DIM}  ${line}${RESET}`);
    }
  } catch (err) {
    print(`${YELLOW}  report fetch failed: ${String(err).slice(0, 120)}${RESET}`);
  }
}

/**
 * 流式时间线打印：与 renderTimeline 相同的行构造器，
 * 但“末子行 └”需要等下一事件到来才能确定，故缓存一个 pending。
 */
class TimelinePrinter {
  private pending: DomainEvent | null = null;

  private flushPending(isLast: boolean): void {
    if (!this.pending) return;
    const line = childLine(this.pending, isLast);
    if (line !== "") print(line);
    this.pending = null;
  }

  /** 返回 "complete" | "error" 表示 run 已终结，false 表示继续 */
  push(event: DomainEvent, projectId?: string): "complete" | "error" | false {
    if (event.type === "stream:ready") return false;
    if (this.pending) this.flushPending(false);
    switch (event.type) {
      case "run:start":
        print(runStartLine(event));
        return false;
      case "phase:start":
        print(phaseHeaderLine(event));
        return false;
      case "phase:complete":
        print(phaseCompleteLine(event, true));
        return false;
      case "phase:error":
        print(phaseCompleteLine(event, false));
        return false;
      case "run:complete":
        for (const line of runCompleteLine(event, projectId)) print(line);
        return "complete";
      case "run:error":
        print(runErrorLine(event));
        return "error";
      default:
        if (childBody(event) !== null) this.pending = event;
        return false;
    }
  }

  /** 超时/退出前冲刷未定子行 */
  flush(): void {
    this.flushPending(true);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    await listProjects(args.url);
    return;
  }

  if (!args.question) {
    console.error(HELP);
    process.exitCode = 1;
    return;
  }

  const url = args.url.replace(/\/$/, "");
  const client = fetchAdapter(url);

  // ① 命令面：SDK startResearch（202 立即回 runId/projectId）
  const started = await startResearch(client, { question: args.question });
  print(`${DIM}run ${started.runId.slice(0, 8)} · project ${started.projectId.slice(0, 8)} · ${url}${RESET}`);

  // ② 事件面：SSE 订阅（带 projectId 过滤 + lastEventId=0 服务端补发，不丢事件）
  const printer = new TimelinePrinter();
  let settled = false;

  const finish = async (code: 0 | 1, fetchReport: boolean): Promise<void> => {
    if (settled) return;
    settled = true;
    printer.flush();
    if (fetchReport) await showLatestReport(url, started.projectId);
    sub.close();
    process.exit(code);
  };

  const sub = subscribeSse(url, onServerEvent, {
    projectId: started.projectId,
    lastEventId: 0,
    onStatus: (status) => {
      if (status === "reconnecting") print(`${YELLOW}[reconnecting]${RESET}`);
    },
  });

  function onServerEvent(event: DomainEvent): void {
    if (event.runId !== undefined && event.runId !== started.runId) return; // 同项目其他 run 不渲染
    const done = printer.push(event, started.projectId);
    if (done === "complete") void finish(0, true);
    else if (done === "error") void finish(1, false);
  }

  // ③ Ctrl-C 干净退出（关流）
  process.on("SIGINT", () => {
    print(`${YELLOW}[interrupted]${RESET}`);
    void finish(1, false);
  });

  // ④ 兜底超时（非交互冒烟：事件到 run:error/run:complete 之前先到 30s 即退出）
  setTimeout(() => {
    print(`${YELLOW}[timeout after ${args.timeoutMs}ms — still listening, exiting]${RESET}`);
    void finish(0, false);
  }, args.timeoutMs).unref();
}

/** 仅作为入口脚本直接执行时跑 CLI（vitest import 不触发） */
if (process.argv[1] !== undefined && process.argv[1].includes("packages/tui/src/index.ts")) {
  main().catch((err) => {
    console.error(`pf-tui: ${String(err).slice(0, 300)}`);
    process.exit(1);
  });
}

export { main, TimelinePrinter, parseArgs };
