# PaperFactory — Research Agent Platform

> 持续维护结构化研究状态、识别当前关键不确定性、选择下一研究动作、组织所需上下文、调用专业能力执行，并依据证据推进研究状态演化的一站式 Research Agent Platform。

治理三公理（frozen，见 `.claude/CLAUDE.md` 宪法）：

> **LLM proposes; the system decides.**
> **Tools execute; the controller governs.**
> **Evidence changes research state; prose does not.**

## 架构总览

**一核心多端**（对标 OpenCode 通信架构）：命令/事件分离 + 统一事件流 + 契约驱动生成 SDK。

```
┌─ 壳层（可增可换）────────────────────────────────────┐
│ frontend/ (React) · ts/packages/tui · 未来 app/desktop │
│     只依赖：@pf/protocol 契约 + @pf/client 生成 SDK    │
├─ 协议 ──────────────────────────────────────────────┤
│ POST /api/research/run 等命令（202 秒回，异步执行）      │
│ GET  /api/events 统一 SSE 事件流（seq 重放/断线续传）    │
│ docs/PROTOCOL.md = 多端契约（事件目录+接入配方）         │
├─ 核心 ts/packages/ ─────────────────────────────────┤
│ schema 契约 · core 状态机/门/工具/事件账本(SQLite)       │
│ research 研究编排(8阶段) · server Hono+SSE             │
│ client codegen SDK · tui 终端客户端                    │
├─ 外部 ──────────────────────────────────────────────┤
│ LLM 网关 · arXiv/SemanticScholar · science-service     │
│ (Python 科学沙箱微服务：latex/pdf/statistics/sandbox)   │
└─────────────────────────────────────────────────────┘
```

分层依赖铁律由架构测试锁定（`ts/test/architecture`——违规即红）。

## 快速开始

```bash
# 1. TS 依赖
cd ts && bun install        # 或 npm install

# 2. science-service（沙箱执行，长驻）
cd ../science-service
uv run --no-sync --with fastapi --with "uvicorn[standard]" --with pydantic \
  --with scipy --with numpy --with pandas --with python-multipart \
  uvicorn main:app --host 127.0.0.1 --port 8001

# 3. 核心 server（另开终端）
cd ../ts
NODE_TLS_REJECT_UNAUTHORIZED=0 \
SCIENCE_SERVICE_URL=http://127.0.0.1:8001 \
LLM_BASE_URL=<你的 OpenAI 兼容网关>/v1 \
LLM_API_KEY=<key> LLM_MODEL=<model> \
PF_DATA_DIR=./data PORT=3001 \
npx tsx src/app/cli.ts run

# 4. Web 壳（另开终端）
cd ../frontend && npm install
API_TARGET=http://127.0.0.1:3001 npx vite --port 5174

# 5. TUI 壳（另开终端）
cd ../ts && npm run tui -- "你的研究问题" --url http://127.0.0.1:3001
```

Docker：`docker/docker-compose.yml`（postgres/migrate/ts-app/science-service）。

## 开发

```bash
cd ts
npm test          # vitest 全量（65 文件 526 用例，含架构测试/契约对齐/账本/投影）
npm run typecheck # tsc --noEmit
npm run generate  # 从 protocol 契约重新生成 client SDK（幂等，勿手改生成物）
npm run tui       # 终端客户端
npm run lint
```

**工程宪法**：`.claude/CLAUDE.md`（52 条，最高约束）
**多端契约**：`docs/PROTOCOL.md`（端点+事件目录+各端接入配方）
**系统工程基线**：`docs/SE/`（NASA SE × V-Model，P0-P8 + REQ 台账——**新开发必须挂 REQ，差距驱动待办**，见 `docs/SE/00-overview.md`）

## 现状（诚实）

REQ 矩阵详见 `docs/SE/P7-verification.md`：研究主线能力已验证（文献/实验/报告/事件流/投影重建）；
已知差距 = manual 审批端到端实测、预算刹车补齐、引用 gate、web 其余视图迁移。
产品级 Validation（真实课题数天尺度）尚未开始。

## 已知环境债

- LLM 网关证书链不全时需 `NODE_TLS_REJECT_UNAUTHORIZED=0`（正确修法：补中间证书或 NODE_EXTRA_CA_CERTS）
- Semantic Scholar 免费通道限流（429）——文献检索自动降级 arXiv（CS/AI 覆盖好，其他学科受限）

## 历史

- Python 初版（七层架构）已退役：`git tag python-legacy-final`
- TS 重写为主体（packages 六包），事件溯源账本 + 多端协议
