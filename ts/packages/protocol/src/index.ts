/**
 * @pf/protocol —— 多端通信契约（唯一定义处）。
 *
 * 端点契约 → codegen 生成 @pf/client SDK；
 * 事件契约 → subscribeEvents（client 生成物）与各端事件分发。
 * 本包零运行时依赖，可被 web / TUI / 桌面 / server 测试同时引用。
 */
export * from "./endpoints";
export * from "./events";
