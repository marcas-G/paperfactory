/**
 * 依赖方向架构测试（分层铁律的代码化）。
 *
 * 扫描 packages/{schema,core,research,server,client,tui,protocol} 下 src 的全部 .ts
 * 与 src/ 下全部 .ts（组装根），提取每条 import（静态 from / 裸 import / 动态 import()），
 * 解析 @pf/* 别名与相对路径跨包引用，断言依赖方向：
 *
 *   schema    不许 import core/research/server/client/tui
 *   core      不许 import research/server/client/tui
 *   research  不许 import server/client/tui
 *   server    不许 import client/tui
 *   client    只许 import protocol（+自身）
 *   tui       只许 import protocol/client（+自身）
 *   protocol  不许 import 任何 @pf/* 包
 *   app(组装根 src/) 允许 import 全部
 *
 * 自由度说明：research 可下行依赖 core/schema；server 可下行依赖 core/research/schema。
 * client/tui/protocol 是末端 SDK 层，采用白名单（allow）模式。
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const PACKAGES = ["schema", "core", "research", "server", "client", "tui", "protocol"] as const;
type Layer = (typeof PACKAGES)[number] | "app";

/** 每层允许依赖的目标。mode=deny：列表为禁入名单；mode=allow：列表为唯一准入名单（自身始终允许）。 */
const LAYER_RULES: Record<Layer, { mode: "deny" | "allow"; targets: string[] }> = {
  protocol: { mode: "allow", targets: [] }, // 协议层零依赖：不许 import 任何 @pf/* 包
  schema: { mode: "deny", targets: ["core", "research", "server", "client", "tui"] },
  core: { mode: "deny", targets: ["research", "server", "client", "tui"] },
  research: { mode: "deny", targets: ["server", "client", "tui"] },
  server: { mode: "deny", targets: ["client", "tui"] },
  client: { mode: "allow", targets: ["protocol"] },
  tui: { mode: "allow", targets: ["protocol", "client"] },
  app: { mode: "allow", targets: [...PACKAGES] }, // 组装根：可 import 一切
};

/**
 * 存量违规白名单——禁止静默豁免：每条必须注明原因，且条目失效（不再命中）会让测试失败，
 * 防止白名单腐烂。当前存量违规为 0。
 */
const WHITELIST: ReadonlyArray<{ file: string; spec: string; reason: string }> = [
  // { file: "packages/xx/src/yy.ts", spec: "@pf/zz", reason: "……" },
];

interface ImportRef {
  /** 相对仓库 ts/ 根 的文件路径 */
  file: string;
  line: number;
  /** 原始 import 说明符 */
  spec: string;
  /** 源码行原文（用于报错定位） */
  text: string;
  /** 解析出的目标层；external=外部/npm 包，self=包内自引用 */
  target: Layer | "external" | "self";
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

function layerOf(absFile: string): Layer | null {
  const rel = path.relative(ROOT, absFile);
  if (rel.startsWith("src/")) return "app";
  const m = rel.match(/^packages\/([a-z]+)\//);
  return m && (PACKAGES as readonly string[]).includes(m[1]) ? (m[1] as Layer) : null;
}

/** 去注释（保留换行与列宽，确保行号/列号不漂移），避免注释里的示例 import 造成假阳性。 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/** 解析说明符 → 目标层 / external / self。 */
function resolveTarget(fromFile: string, spec: string): Layer | "external" | "self" {
  const alias = spec.match(/^@pf\/([a-z]+)(?:\/|$)/);
  if (alias) return alias[1] === layerOf(fromFile) ? "self" : (alias[1] as Layer);
  if (spec.startsWith("@app")) return layerOf(fromFile) === "app" ? "self" : "app";
  if (!spec.startsWith(".")) return "external"; // npm 包 / node: 内置
  const resolved = path.resolve(path.dirname(fromFile), spec);
  const rel = path.relative(ROOT, resolved);
  if (rel.startsWith("..")) return "external"; // 逃出仓库根（不太可能，防御）
  if (rel.startsWith("src/")) return layerOf(fromFile) === "app" ? "self" : "app";
  const m = rel.match(/^packages\/([a-z]+)\//);
  if (!m) return "external"; // 指向包目录之外的非 src 区域（如 script/）
  return m[1] === layerOf(fromFile) ? "self" : (m[1] as Layer);
}

function scanAll(): ImportRef[] {
  const roots = [path.join(ROOT, "src"), ...PACKAGES.map((p) => path.join(ROOT, "packages", p, "src"))];
  const files = roots.flatMap((r) => (fs.existsSync(r) ? walk(r) : []));
  const refs: ImportRef[] = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).replaceAll("\\", "/");
    const lines = stripComments(fs.readFileSync(file, "utf8")).split("\n");
    const joined = lines.join("\n");
    // 静态 import/export ... from "x"、裸 import "x"、动态 import("x")
    const patterns = [/\bfrom\s*["']([^"'\n]+)["']/g, /\bimport\s+["']([^"'\n]+)["']/g, /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g];
    const seen = new Set<string>(); // 同一行同一说明符只报一次
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(joined)) !== null) {
        const spec = m[1];
        const line = joined.slice(0, m.index).split("\n").length;
        const key = `${line}:${spec}`;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push({ file: rel, line, spec, text: lines[line - 1].trim(), target: resolveTarget(file, spec) });
      }
    }
  }
  return refs;
}

function findViolations(): { ref: ImportRef; rule: string; layer: Layer }[] {
  const hits = new Set<string>();
  const violations: { ref: ImportRef; rule: string; layer: Layer }[] = [];
  for (const ref of scanAll()) {
    const layer = layerOf(path.join(ROOT, ref.file));
    if (!layer || ref.target === "external" || ref.target === "self") continue;
    const rule = LAYER_RULES[layer];
    const banned = rule.mode === "deny" ? rule.targets.includes(ref.target) : !rule.targets.includes(ref.target);
    if (!banned) continue;
    const wl = WHITELIST.find((w) => w.file === ref.file && w.spec === ref.spec);
    if (wl) {
      hits.add(`${wl.file}|${wl.spec}`);
      continue; // 显式豁免（带原因），不算违规
    }
    const direction = rule.mode === "deny" ? `不许依赖 ${rule.targets.join("/")}` : `只许依赖 [${rule.targets.join("/")}]（+自身）`;
    violations.push({ ref, layer, rule: `${layer} → ${ref.target}（${direction}）` });
  }
  // 白名单条目必须仍然命中，失效即失败（防静默腐烂）
  for (const w of WHITELIST) {
    if (!hits.has(`${w.file}|${w.spec}`)) {
      violations.push({
        ref: { file: w.file, line: 0, spec: w.spec, text: "(whitelist)", target: "self" },
        layer: "app",
        rule: `白名单条目已失效（代码中不存在该违规，请删除）：${w.file} → ${w.spec}`,
      });
    }
  }
  return violations;
}

describe("架构：依赖方向铁律", () => {
  const refs = scanAll();

  it("扫描器自检：每个包的 src 都被扫到（防止 glob 失效导致规则静默通过）", () => {
    const layers = new Set(refs.map((r) => path.join(ROOT, r.file)).map((f) => layerOf(f)));
    for (const pkg of PACKAGES) expect(layers, `packages/${pkg}/src 未被扫描`).toContain(pkg);
    expect(layers).toContain("app");
    // 扫描器必须能识别全部三种 import 形态的项目内引用（否则规则形同虚设）
    expect(refs.some((r) => r.target === "protocol" && r.spec.startsWith("../")), "相对路径跨包引用未被解析").toBe(true);
    expect(refs.some((r) => /import\(/.test(r.text) || r.spec.startsWith("@pf/")), "别名/动态 import 未被解析").toBe(true);
  });

  it("包间依赖方向符合分层铁律（违反即列出 文件:行 与违规行原文）", () => {
    const violations = findViolations();
    const report = violations
      .map((v) => `  [${v.rule}]\n    ${v.ref.file}:${v.ref.line}  «${v.ref.spec}»\n    > ${v.ref.text}`)
      .join("\n");
    expect(violations, `依赖方向违规 ${violations.length} 处：\n${report}\n`).toEqual([]);
  });
});
