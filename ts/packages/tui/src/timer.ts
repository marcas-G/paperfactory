/**
 * 计时与统计 —— 纯函数/可注入时钟，无 IO。
 *
 * - formatDuration: 毫秒 → `03m 12s` 固定宽度（分≥2位、秒恒2位；分钟超 60 不进位，
 *   如 `123m 45s`）—— 每秒刷新时宽度不变，thinking 行/状态栏不再左右跳动
 * - estimateTokens: 无 usage 事件时的客户端口径估算（CJK 1 字 ≈ 1 tok，ASCII 4 字符 ≈ 1 tok）
 * - SPINNER_FRAMES: running 状态的动画帧（方案B：后端无 text:delta 时的“活着”信号）
 */

/** 毫秒 → 固定宽度时长 `MMm SSs`（秒恒两位、分至少两位；分钟累加不进位小时） */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "00m 00s";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

/** token 估算（客户端口径：只统计事件流里经过的文本，标 `~` 前缀由调用方加） */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let ascii = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (isCJK(code)) cjk++;
    else if (code >= 0x21 && code <= 0x7e) ascii++;
  }
  return cjk + Math.ceil(ascii / 4);
}

/** CJK/全角码点（与 render.ts 的宽度判定保持一致的近似） */
function isCJK(code: number): boolean {
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

/** Braille 转圈帧（tick 从 0 递增，动画周期 ~1s） */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export function spinnerFrame(tick: number): string {
  const n = SPINNER_FRAMES.length;
  return SPINNER_FRAMES[((tick % n) + n) % n];
}

/** `1234` → `1.2k`（状态栏 token 统计） */
export function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
