# P5 — Detailed Design

> 阶段唯一问题：**每个元素内部精确怎样工作？**（只写行为契约级细节，代码见 P6 映射）

## D1 Agent Loop（core/runtime/agent/loop.ts）

```text
输入：初始消息 + 工具定义 + 预算(maxIterations)
循环：LLM 推理 → 若产生 tool_calls 则逐个执行（registry 路由）
     → 结果回填消息 → 下一轮；无 tool_calls 即终止
每轮产出 AgentEvent（thinking/tool:calling/tool:result/...）
不变量：工具参数必经注册 schema（模型不可见未声明参数）；
        LLM 断线重试 1 次后向上抛（由编排层决定降级或失败）
```

## D2 事件账本（server/events.ts）

```text
表：events(seq INTEGER PK AUTOINCREMENT, type, project_id, run_id,
           phase, data TEXT, timestamp)   仅 INSERT/SELECT
emit = 同步 INSERT + 进程内广播；DB 故障 → warn 并降级纯内存（seq 不回退）
since(lastSeq) = SELECT WHERE seq > lastSeq ORDER BY seq
SSE 帧：`id: <seq>\ndata: {json}\n\n`；25s 心跳注释行；
        重连（Last-Event-ID 或 ?lastEventId=）从 DB 补发
不变量：seq 全局单调；事件不可变；一条事件一次投递到流
```

## D3 命令受理（server/routes/research-runs.ts POST /api/research/run）

```text
1. 校验 question（≤2048）→ 422 带结构化错误
2. 落 project + hypothesis 对象 → 202 {runId, projectId, status:"started"}
3. 后台执行 runAgentDrivenResearch；全部 onEvent → eventBus.emit
4. manual 模式：onApprovalNeeded → 发 awaiting_approval 事件 +
   Promise 挂起（decision 端点 resolve）
5. 结束：run:complete/run:error 事件；researchRuns 注册表清理
不变量：HTTP 响应时延与任务时长无关（秒回）
```

## D4 文献检索工具（core/runtime/tools/builtins/literature.ts）

```text
两级检索：Semantic Scholar（全学科，429 退避 2s 一次）→ 失败/空则
arXiv（短语精确优先，0 命中降级宽松词）；20s 超时 ×2 重试
输出：papers[{title, authors, summary, url, published}]（真实可点开来源）
失败语义：双源全失败 → 工具错误（编排层降级，不崩溃运行）
```

## D5 审批挂起（manual 模式）

```text
阶段完成 → gate 前触发 onApprovalNeeded(runId, phase, summary)
服务端：researchRuns[runId].approvalResolve = pending Promise
客户端收到 phase:awaiting_approval → POST decision(approve/modify/reject)
resolve 后研究继续；run 被停止时未决 Promise 以 reject 收尾
不变量：审批是正式状态（事件入账），不是 UI 弹窗副作用
```

## D6 契约与生成（protocol + client/script/generate.ts）

```text
契约表条目：{method, path, pathParams, request, response}（33 端点）
codegen：契约 → typed 函数（fetch 适配注入）+ subscribeEvents
一致性测试：契约表 ↔ server 路由双向快照对齐（加端点忘进契约即红）
不变量：生成物禁止手改；重跑逐字节幂等（md5 验证）
```

## D7 TUI（packages/tui）

```text
纯客户端：SDK 发命令 + fetch 版 SSE 读流（跨 chunk 断帧重组）
渲染：事件数组 → 树形时间线（中文阶段映射表写死）
断线：带 lastEventId 重连，打印 [reconnecting]
禁止 import @pf/server/@pf/core（架构测试锁定）
```

## P5 Exit Gate 自查

| 问 | 答 |
|---|---|
| 每元素接口/不变量明确 | D1-D7 各含不变量条目 |
| 异常路径有定义 | 各节"失败语义"显式写出 |
| P4 每元素均有 D 条目 | 六包+协议全覆盖（组装根属 P6 映射） |
