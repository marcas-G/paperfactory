/**
 * @pf/client —— 由 @pf/protocol 契约生成的多端 API SDK。
 *
 * generated/ 由 packages/client/script/generate.ts 产出（AUTO-GENERATED，勿手改）。
 * 传输层通过 ClientAdapter 注入（axiosAdapter / fetchAdapter），SDK 本身零平台绑定。
 */
export * from "./generated/endpoints";
export * from "./generated/events";
export * from "./adapter";

/** 契约常量与全部契约类型（单入口转发，web/TUI 只 import 这里） */
export { EVENT_TYPES, EVENT_TYPE_VALUES } from "../../protocol/src";
export type * from "../../protocol/src";
