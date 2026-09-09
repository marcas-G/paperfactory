/**
 * 计时与统计 —— 纯函数/可注入时钟，无 IO。
 *
 * - formatDuration: 毫秒 → `3m 12s` / `45s` / `2h 01m` 紧凑人类可读
 * - estimateTokens: 无 usage 事件时的客户端口径估算（CJK 1 字 ≈ 1 tok，ASCII 4 字符 ≈ 1 tok）
 * - SPINNER_FRAMES: running 状态的动画帧（方案B：后端无 text:delta 时的“活着”信号）
 */

/** 毫秒 → 紧凑时长（<1m 显示秒；>=1m 显示 m s；>=1h 显示 h m） */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
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
