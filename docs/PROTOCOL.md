# PaperFactory 多端通信协议 v1

> 核心与界面解耦：**一核心，多壳**。Web / 手机 App / 桌面 / TUI 都是同一核心的客户端。
> 架构对标 OpenCode：命令与事件分离，一条统一事件流驱动所有端。

## 四通道总览

| 通道 | 端点 | 职责 |
|---|---|---|
| **命令** | `POST /api/research/run` | 发起动作，**秒回 runId（202）**，执行异步进行 |
| **事件** | `GET /api/events` (SSE) | **唯一事件出口**：全部进度从这条流广播 |
| **资源** | `GET /api/projects...` | 查询当前状态（幂等只读） |
| **审批** | `POST /api/projects/:id/phases/:runId/decision` | 人在回路（manual 模式） |

## 命令目录

### 发起研究

```
POST /api/research/run
{ "question": "...", "mode": "auto" | "manual" }

→ 202 { "runId": "...", "projectId": "...", "status": "started" }
```

`mode: manual` 时每个阶段完成会发 `phase:awaiting_approval` 事件并暂停，
客户端用 decision 端点回复 `approve | modify | reject`。

### 停止 / 状态

```
POST /api/research/:runId/stop      → { "stopped": true }
GET  /api/research/:runId/status    → { "status": "running" | "stopped" }
```

## 事件流

```
GET /api/events                      # 全部事件
GET /api/events?projectId=<id>       # 按项目过滤
```

- 传输：SSE，每条 `data: {json}\n\n`，带 `id: <seq>`（单调递增）
- **断线重连**：客户端重连时浏览器自动携带 `Last-Event-ID`，服务端补发
  之后的事件（错过的不丢）；非浏览器客户端传 `?lastEventId=<seq>`
- 心跳：每 25s 一条 `: ping` 注释行

### 事件信封（所有事件同一信封）

```jsonc
{
  "seq": 42,              // 单调递增，重续传游标
  "type": "phase:start",  // 事件类型，见目录
  "projectId": "...",     // 归属项目（过滤键）
  "runId": "...",         // 归属运行
  "phase": "literature_search",
  "data": { ... },        // 类型相关负载
  "timestamp": "ISO-8601"
}
```

### 事件目录

| type | data 要点 | 说明 |
|---|---|---|
| `run:start` | question | 运行开始 |
| `phase:start` | — | 阶段开始（phase 在信封） |
| `phase:progress` | content | 阶段内进度文案 |
| `thinking` | content, iteration | agent 推理轮次 |
| `tool:calling` | toolName, toolArgs | 工具调用发起 |
| `tool:result` | toolName, toolResult | 工具返回（文献工具含 papers 数组） |
| `phase:complete` / `phase:error` | — / error | 阶段结束 |
| `phase:awaiting_approval` | summary | 等待人工决策（manual 模式） |
| `self:review` | passed | 自审结果 |
| `run:complete` | counts（evidence/knowledge/report） | 运行完成 |
| `run:error` | error | 运行失败 |
| `stream:ready` | — | 连接建立确认 |

## 资源端点（节选）

```
GET /api/projects                          项目列表
GET /api/projects/:id/phases               阶段运行记录
GET /api/projects/:id/knowledge            文献知识项
GET /api/projects/:id/evidence             证据
GET /api/projects/:id/reports              报告（run:complete 后拉取渲染）
```

## 各端接入配方

- **Web**（已实现）：`frontend/src/api/events.ts` 是订阅模块样板
- **手机 App**：SSE 可用任何 EventSource 庽（或降级轮询 `GET /api/events?lastEventId=`），
  命令/资源全 REST JSON，无 WebSocket 依赖
- **TUI**：curl / 任意 HTTP 客户端订阅同一 SSE 流，逐行解析渲染
- **桌面**：同 Web；或直接内嵌 HTTP（参考 OpenCode 的 in-process 模式）

## 设计不变量（改协议前必读）

1. 命令秒回、进度走事件——**命令连接永不挂等长任务**
2. 事件是唯一进度出口——任何端不轮询业务状态来推断进度
3. seq 单调 + Last-Event-ID 补发——**断线不丢事件**
4. 事件不可变——重放安全（未来接 PG 账本时直接事件溯源）
