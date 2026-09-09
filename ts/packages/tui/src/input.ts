/**
 * 输入处理 —— raw mode 按键捕获（零依赖）。
 *
 * 分两层：
 *   KeyDecoder  —— 纯字节流 → Key[]（UTF-8 多字节/CSI 序列/控制键），单测直接喂 Buffer
 *   InputHandler —— 接 process.stdin（TTY 时开 raw mode），回调分发；非 TTY 由
 *                 index.ts 走 readline 行模式后复用 push()
 *
 * 按键契约：
 *   Enter=\r|\n 发送 · Esc（单独）停止 · Ctrl+C(\x03) 退出 · Tab(\x09) 切模式
 *   Backspace(\x7f|\x08) 删字符 · Ctrl+L 重绘
 *   方向键 \x1b[A/B/C/D → up/down/right/left（输入历史 / 光标移动）
 *   Home/End → \x1b[H/F 或 \x1b[1~/4~ · Delete → \x1b[3~
 *   PageUp/PageDown → \x1b[5~/6~（报告分页）
 */

export type Key =
  | { type: "text"; text: string }
  | { type: "enter" }
  | { type: "esc" }
  | { type: "tab" }
  | { type: "backspace" }
  | { type: "delete" }
  | { type: "left" }
  | { type: "right" }
  | { type: "up" }
  | { type: "down" }
  | { type: "home" }
  | { type: "end" }
  | { type: "pageup" }
  | { type: "pagedown" }
  | { type: "ctrl-c" }
  | { type: "ctrl-l" }
  | { type: "ignored" };

/** CSI/SS3 序列的中间字节（参数区 0x30-0x3F，中间 0x20-0x2F，最终字节 0x40-0x7E） */
function isEscapeIntermediate(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x3f;
}

function isEscapeFinal(byte: number): boolean {
  return byte >= 0x40 && byte <= 0x7e;
}

/** 参数字节 → 数字（0x30-0x39 → 0-9，其余 NaN） */
function digitValue(byte: number): number {
  return byte >= 0x30 && byte <= 0x39 ? byte - 0x30 : Number.NaN;
}

/** CSI/SS3 序列 → 语义键（不认识的吞掉） */
function decodeSequence(intro: number, params: number[], final: number): Key | null {
  // SS3（\x1bO）与 CSI（\x1b[）的 A/B/C/D/H/F 语义一致；带参数的（修饰键组合）不映射
  if (params.length === 0) {
    switch (final) {
      case 0x41: return { type: "up" };
      case 0x42: return { type: "down" };
      case 0x43: return { type: "right" };
      case 0x44: return { type: "left" };
      case 0x48: return { type: "home" };
      case 0x46: return { type: "end" };
    }
  }
  if (final === 0x7e) {
    // `~` 结尾的功能键：参数区首数字决定语义（1/7=Home 3=Delete 4/8=End 5=PgUp 6=PgDn）
    switch (digitValue(params[0] ?? Number.NaN)) {
      case 1:
      case 7:
        return { type: "home" };
      case 3:
        return { type: "delete" };
      case 4:
      case 8:
        return { type: "end" };
      case 5:
        return { type: "pageup" };
      case 6:
        return { type: "pagedown" };
    }
  }
  // 修饰键组合（\x1b[1;5C = Ctrl+Right 等）与其他未知序列：吞掉
  void intro;
  return null;
}

export class KeyDecoder {
  private utf8 = new TextDecoder("utf-8", { fatal: false });
  private pendingBytes: number[] = []; // 未完成 UTF-8 序列
  private escapePending = false; // 孤立 \x1b（下一 chunk 判定是 CSI 还是真 Esc）
  private escapeActive = false; // 正在收集 CSI/SS3 序列
  private seqIntro = 0x5b; // 序列引导字节（[ 或 O）
  private seqParams: number[] = []; // 参数/中间字节

  /** 喂入一段字节，返回完整解出的按键（可能为空数组） */
  push(chunk: Buffer | string): Key[] {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk, "binary") : chunk;
    const keys: Key[] = [];
    const text: number[] = [];

    const flushText = (): void => {
      if (text.length === 0) return;
      const decoded = this.utf8.decode(new Uint8Array(text), { stream: true });
      if (decoded) keys.push({ type: "text", text: decoded });
      text.length = 0;
    };

    // 上一 chunk 末尾的孤立 Esc：新字节到来 → 不是 CSI 就是真 Esc+字符
    if (this.escapePending) {
      this.escapePending = false;
      keys.push({ type: "esc" });
    }

    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (this.escapeActive) {
        if (isEscapeFinal(byte)) {
          this.escapeActive = false;
          const key = decodeSequence(this.seqIntro, this.seqParams, byte);
          if (key) keys.push(key);
          this.seqParams = [];
        } else if (isEscapeIntermediate(byte)) {
          this.seqParams.push(byte);
        } else {
          this.escapeActive = false; // 畸形序列，放弃
          this.seqParams = [];
        }
        continue; // 序列字节一律吞掉
      }

      if (byte === 0x1b) {
        flushText();
        const nextByte = bytes[i + 1];
        if (nextByte === undefined) {
          // chunk 末尾孤立 Esc：单字节 chunk（真实 Esc 键）立即触发；
          // 多字节 chunk 尾巴（可能被劈开的序列）留给下一 chunk 判定
          if (bytes.length === 1) keys.push({ type: "esc" });
          else this.escapePending = true;
        } else if (nextByte === 0x5b || nextByte === 0x4f) {
          this.escapeActive = true; // \x1b[ ... / \x1bO ... 序列开始
          this.seqIntro = nextByte;
          this.seqParams = [];
          i++; // 跳过引导字节（[ / O 本身不是参数也不是 final）
        } else {
          keys.push({ type: "esc" }); // Esc 前缀键（Alt+X 等）按 Esc 处理
        }
        continue;
      }

      switch (byte) {
        case 0x0d:
        case 0x0a:
          flushText();
          keys.push({ type: "enter" });
          continue;
        case 0x09:
          flushText();
          keys.push({ type: "tab" });
          continue;
        case 0x7f:
        case 0x08:
          flushText();
          keys.push({ type: "backspace" });
          continue;
        case 0x03:
          flushText();
          keys.push({ type: "ctrl-c" });
          continue;
        case 0x0c:
          flushText();
          keys.push({ type: "ctrl-l" });
          continue;
        default:
          break;
      }

      if (byte < 0x20) {
        flushText();
        keys.push({ type: "ignored" }); // 其他控制字符（Ctrl+X 等）吞掉
        continue;
      }
      text.push(byte); // 可打印/多字节 UTF-8 累积
    }

    flushText();
    return keys;
  }

  /** 流结束时冲刷未决状态（孤立 Esc 视作 Esc 键） */
  flush(): Key[] {
    const keys: Key[] = [];
    if (this.escapePending) {
      this.escapePending = false;
      keys.push({ type: "esc" });
    }
    if (this.escapeActive) {
      this.escapeActive = false;
      this.seqParams = [];
    }
    const rest = this.utf8.decode();
    if (rest) keys.push({ type: "text", text: rest });
    return keys;
  }
}

export interface InputCallbacks {
  onText?(text: string): void;
  onEnter?(): void;
  onEsc?(): void;
  onTab?(): void;
  onBackspace?(): void;
  onDelete?(): void;
  onLeft?(): void;
  onRight?(): void;
  onUp?(): void;
  onDown?(): void;
  onHome?(): void;
  onEnd?(): void;
  onPageUp?(): void;
  onPageDown?(): void;
  onCtrlC?(): void;
  onCtrlL?(): void;
  onIgnored?(): void;
}

/** 单测用：按键 → 回调分发（不碰 stdin） */
export function dispatchKeys(keys: Key[], cb: InputCallbacks): void {
  for (const key of keys) {
    switch (key.type) {
      case "text":
        cb.onText?.(key.text);
        break;
      case "enter":
        cb.onEnter?.();
        break;
      case "esc":
        cb.onEsc?.();
        break;
      case "tab":
        cb.onTab?.();
        break;
      case "backspace":
        cb.onBackspace?.();
        break;
      case "delete":
        cb.onDelete?.();
        break;
      case "left":
        cb.onLeft?.();
        break;
      case "right":
        cb.onRight?.();
        break;
      case "up":
        cb.onUp?.();
        break;
      case "down":
        cb.onDown?.();
        break;
      case "home":
        cb.onHome?.();
        break;
      case "end":
        cb.onEnd?.();
        break;
      case "pageup":
        cb.onPageUp?.();
        break;
      case "pagedown":
        cb.onPageDown?.();
        break;
      case "ctrl-c":
        cb.onCtrlC?.();
        break;
      case "ctrl-l":
        cb.onCtrlL?.();
        break;
      case "ignored":
        cb.onIgnored?.();
        break;
    }
  }
}

export class InputHandler {
  private decoder = new KeyDecoder();
  private started = false;

  constructor(
    private cb: InputCallbacks,
    private stdin: NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (m: boolean) => void } = process.stdin,
  ) {}

  get isRaw(): boolean {
    return this.started;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.stdin.isTTY && this.stdin.setRawMode) this.stdin.setRawMode(true);
    this.stdin.on("data", this.onData);
    this.stdin.resume();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.stdin.removeListener("data", this.onData);
    if (this.stdin.isTTY && this.stdin.setRawMode) this.stdin.setRawMode(false);
    this.stdin.pause();
  }

  /** 测试/行模式注入口 */
  push(chunk: Buffer | string): void {
    dispatchKeys(this.decoder.push(chunk), this.cb);
  }

  private onData = (chunk: Buffer | string): void => {
    dispatchKeys(this.decoder.push(chunk), this.cb);
  };
}
