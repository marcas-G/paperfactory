/**
 * 事件契约 —— 统一事件流（GET /api/events，SSE）的类型目录。
 *
 * 对应 docs/PROTOCOL.md 的事件目录表；契约与 server eventBus 实际发送的
 * 载荷一致（信封字段按线上 wire format：stream:ready 帧无 seq/timestamp，
 * 故均为可选）。SDK 侧由 packages/client 生成的 subscribeEvents 消费。
 */

/* ------------------------------------------------------------------ */
/*  事件信封                                                            */
/* ------------------------------------------------------------------ */

/** 所有事件同一信封（data 负载类型见 EventDataMap） */
export interface DomainEvent<Data = Record<string, unknown>> {
  /** 单调递增序号，断线重连游标（stream:ready 帧无此字段） */
  seq?: number;
  /** 事件类型，取值见 EVENT_TYPES */
  type: string;
  /** 归属项目（客户端过滤键） */
  projectId?: string;
  /** 归属运行 */
  runId?: string;
  /** 阶段名 */
  phase?: string;
  /** 类型相关负载 */
  data?: Data;
  /** ISO-8601（stream:ready 帧无此字段） */
  timestamp?: string;
}

/* ------------------------------------------------------------------ */
/*  事件类型目录                                                        */
/* ------------------------------------------------------------------ */

export const EVENT_TYPES = {
  runStart: "run:start",
  phaseStart: "phase:start",
  phaseProgress: "phase:progress",
  thinking: "thinking",
  toolCalling: "tool:calling",
  toolResult: "tool:result",
  phaseComplete: "phase:complete",
  phaseError: "phase:error",
  phaseAwaitingApproval: "phase:awaiting_approval",
  selfReview: "self:review",
  runComplete: "run:complete",
  runError: "run:error",
  /** 连接建立确认（无 seq/timestamp/data） */
  streamReady: "stream:ready",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export const EVENT_TYPE_VALUES: readonly string[] = Object.values(EVENT_TYPES);

/* ------------------------------------------------------------------ */
/*  各事件 data 负载类型（字段按 server 实际发送，均可能缺省）             */
/* ------------------------------------------------------------------ */

export interface RunStartData {
  question?: string;
}

/** agent 轮次事件（phase:progress / thinking / tool:* / self:review 共用打包结构） */
export interface AgentLoopEventData {
  content?: string;
  iteration?: number;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
  passed?: boolean;
}

export interface PhaseAwaitingApprovalData {
  summary?: string;
}

export interface RunCompleteData {
  hypothesisStatements?: string[];
  evidenceCount?: number;
  knowledgeCount?: number;
  reportCount?: number;
}

export interface RunErrorData {
  error?: string;
}

/** 事件类型 → data 负载类型映射 */
export interface EventDataMap {
  "run:start": RunStartData;
  "phase:start": Record<string, never>;
  "phase:progress": AgentLoopEventData;
  "thinking": AgentLoopEventData;
  "tool:calling": AgentLoopEventData;
  "tool:result": AgentLoopEventData;
  "phase:complete": Record<string, never>;
  "phase:error": AgentLoopEventData;
  "phase:awaiting_approval": PhaseAwaitingApprovalData;
  "self:review": AgentLoopEventData;
  "run:complete": RunCompleteData;
  "run:error": RunErrorData;
  "stream:ready": Record<string, never>;
}

/** 携带精确事件类型与负载类型的信封 */
export interface TypedDomainEvent<K extends keyof EventDataMap = keyof EventDataMap>
  extends Omit<DomainEvent, "type" | "data"> {
  type: K;
  data?: EventDataMap[K];
}
