/**
 * input.ts 单测 —— 按键解码（控制键/UTF-8 分片/CSI 序列/孤立 Esc）与回调分发。
 */
import { describe, it, expect, vi } from "vitest";
import { KeyDecoder, dispatchKeys } from "../../packages/tui/src/input";

describe("KeyDecoder 控制键", () => {
  it("Enter / Tab / Backspace / Ctrl+C / Ctrl+L", () => {
    const d = new KeyDecoder();
    expect(d.push("a\r")).toEqual([{ type: "text", text: "a" }, { type: "enter" }]);
    expect(d.push("\n")).toEqual([{ type: "enter" }]);
    expect(d.push("\t")).toEqual([{ type: "tab" }]);
    expect(d.push("\x7f")).toEqual([{ type: "backspace" }]);
    expect(d.push("\x08")).toEqual([{ type: "backspace" }]);
    expect(d.push("\x03")).toEqual([{ type: "ctrl-c" }]);
    expect(d.push("\x0c")).toEqual([{ type: "ctrl-l" }]);
  });

  it("其他控制字符被吞（ignored），不进文本", () => {
    const d = new KeyDecoder();
    expect(d.push("\x01\x02")).toEqual([{ type: "ignored" }, { type: "ignored" }]);
  });

  it("CSI 方向键解出语义键（up/down/left/right），不影响后续文本", () => {
    const d = new KeyDecoder();
    const keys = d.push("\x1b[A\x1b[Cx");
    expect(keys).toEqual([{ type: "up" }, { type: "right" }, { type: "text", text: "x" }]);
    const keys2 = d.push("\x1b[B\x1b[D");
    expect(keys2).toEqual([{ type: "down" }, { type: "left" }]);
  });

  it("Home/End/Delete/PageUp/PageDown（CSI 字母与 ~ 数字两种形态）", () => {
    const d = new KeyDecoder();
    expect(d.push("\x1b[H\x1b[F")).toEqual([{ type: "home" }, { type: "end" }]);
    const d2 = new KeyDecoder();
    expect(d2.push("\x1b[1~\x1b[4~")).toEqual([{ type: "home" }, { type: "end" }]);
    const d3 = new KeyDecoder();
    expect(d3.push("\x1b[3~\x1b[5~\x1b[6~")).toEqual([{ type: "delete" }, { type: "pageup" }, { type: "pagedown" }]);
  });

  it("修饰键组合序列（Ctrl+Right 等）整体吞掉，不影响后续文本", () => {
    const d = new KeyDecoder();
    const keys = d.push("\x1b[1;5Dy");
    expect(keys).toEqual([{ type: "text", text: "y" }]);
  });

  it("单字节 Esc chunk（真实 Esc 键）立即解出", () => {
    const d = new KeyDecoder();
    expect(d.push("\x1b")).toEqual([{ type: "esc" }]);
  });

  it("多字节 chunk 尾部孤立 Esc → 下一 chunk 判定为 Esc 键", () => {
    const d = new KeyDecoder();
    expect(d.push("a\x1b")).toEqual([{ type: "text", text: "a" }]);
    const next = d.push("z");
    expect(next).toEqual([{ type: "esc" }, { type: "text", text: "z" }]);
  });

  it("流结束时 flush 把未决 Esc 冲出来", () => {
    const d = new KeyDecoder();
    d.push("a\x1b");
    expect(d.flush()).toEqual([{ type: "esc" }]);
  });
});

describe("KeyDecoder UTF-8", () => {
  it("多字节 CJK 完整到达", () => {
    const d = new KeyDecoder();
    expect(d.push(Buffer.from("文献", "utf8"))).toEqual([{ type: "text", text: "文献" }]);
  });

  it("多字节 CJK 跨 chunk 分片重组", () => {
    const d = new KeyDecoder();
    const bytes = Buffer.from("研", "utf8"); // 3 字节
    expect(d.push(bytes.subarray(0, 1))).toEqual([]);
    expect(d.push(bytes.subarray(1, 2))).toEqual([]);
    expect(d.push(bytes.subarray(2))).toEqual([{ type: "text", text: "研" }]);
  });

  it("文本与控制键混合按序解出", () => {
    const d = new KeyDecoder();
    const keys = d.push(Buffer.from("hi\r", "utf8"));
    expect(keys).toEqual([{ type: "text", text: "hi" }, { type: "enter" }]);
  });
});

describe("dispatchKeys 回调分发", () => {
  it("各键型路由到对应回调", () => {
    const cb = {
      onText: vi.fn(),
      onEnter: vi.fn(),
      onEsc: vi.fn(),
      onTab: vi.fn(),
      onBackspace: vi.fn(),
      onCtrlC: vi.fn(),
    };
    const d = new KeyDecoder();
    dispatchKeys(d.push("a\t\b\r\x1b\x03"), cb);
    expect(cb.onText).toHaveBeenCalledWith("a");
    expect(cb.onTab).toHaveBeenCalledTimes(1);
    expect(cb.onBackspace).toHaveBeenCalledTimes(1);
    expect(cb.onEnter).toHaveBeenCalledTimes(1);
    expect(cb.onEsc).toHaveBeenCalledTimes(1);
    expect(cb.onCtrlC).toHaveBeenCalledTimes(1);
  });
});

describe("KeyDecoder SGR 鼠标（\\x1b[?1006h 模式）", () => {
  it("滚轮上/下：\\x1b[<64;col;rowM / \\x1b[<65;col;rowM", () => {
    const d = new KeyDecoder();
    expect(d.push("\x1b[<64;12;5M")).toEqual([{ type: "scroll", direction: "up" }]);
    expect(d.push("\x1b[<65;12;5M")).toEqual([{ type: "scroll", direction: "down" }]);
  });

  it("左键按下 = click（col/row 1-based）；释放 m 不产生键", () => {
    const d = new KeyDecoder();
    expect(d.push("\x1b[<0;10;3M")).toEqual([{ type: "click", col: 10, row: 3 }]);
    expect(d.push("\x1b[<0;10;3m")).toEqual([]);
  });

  it("修饰键/拖动/中右键滚轮外的按钮吞掉，不影响后续按键", () => {
    const d = new KeyDecoder();
    // Shift+左键(b=4)、拖动(b=32)、中键(b=1)、水平滚轮(b=66)
    expect(d.push("\x1b[<4;1;1M\x1b[<32;1;1M\x1b[<1;1;1M\x1b[<66;1;1M\x1b[A")).toEqual([{ type: "up" }]);
  });

  it("鼠标序列跨 chunk 分片仍完整解出", () => {
    const d = new KeyDecoder();
    expect(d.push("\x1b[<6")).toEqual([]);
    expect(d.push("4;2;2M")).toEqual([{ type: "scroll", direction: "up" }]);
  });

  it("dispatchKeys 路由 onScroll / onClick", () => {
    const cb = { onScroll: vi.fn(), onClick: vi.fn() };
    dispatchKeys(
      [
        { type: "scroll", direction: "up" },
        { type: "scroll", direction: "down" },
        { type: "click", col: 5, row: 7 },
      ],
      cb,
    );
    expect(cb.onScroll).toHaveBeenCalledWith("up");
    expect(cb.onScroll).toHaveBeenCalledWith("down");
    expect(cb.onClick).toHaveBeenCalledWith(5, 7);
  });
});
