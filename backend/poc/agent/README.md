# T0.3 deepagents PoC（迭代十 AI 诊断 / M0 前置验证）

验证目标：**acm PostgreSQL 管理的模型配置 → 解密 → 按协议分派模型客户端（openai→ChatOpenAI / anthropic→ChatAnthropic）→ deepagents 工具调用 → PG checkpoint 跨进程持久化**，全程不依赖 LLM 环境变量。代码在 `backend/poc/`（tsconfig exclude，不参与 build/test）。

> 结论（2026-09-22）：全链路已跑通。原 RedisSaver 方案因硬依赖 RedisJSON/RediSearch 模块弃用，
> acm 库随之由 MySQL 迁移 PostgreSQL，详见 `docs/plan/M0-Spike结论.md`。

## 前置条件

1. 本地容器 `acore-mysql`(3306) / `acore-redis`(6379) / `acm-postgres`(5433，`docker compose up -d acm-postgres`) 已启动；`backend/.env.local` 指向 `127.0.0.1`
2. acm 库（PG）与 `ai_model_config` 表已就绪（`docker/database/migrations/*.sql`）：
   ```bash
   cd backend && npm run db:migrate
   ```
3. `backend/.env.local` 需含 `ACM_DB_URL=postgres://...@127.0.0.1:5433/acm` 与 `LLM_AES_KEY`

## 运行步骤

```bash
cd backend

# 1. 配置模型（推荐走 Web UI：/model-config 页面；或用种子脚本命令行一次性传入 Key）
npx tsx poc/agent/seed-model-config.ts --api-key=<你的 LLM API Key>

# 2. 主流程：两轮对话（工具调用 + 上文记忆）→ streamEvents 事件类型采集 → PG checkpoint 观测
npx tsx poc/agent/index.ts

# 3. 重跑验证跨进程持久化：全新进程只问第 3 轮问题，能答出第 1 轮字符串即为通过
npx tsx poc/agent/index.ts resume

# （一次性）MySQL 时代配置行迁移到 PG：AES 密文直接搬运，无需重填 Key
npx tsx poc/agent/migrate-mysql-to-pg.ts
```

## 成功标准（对应《AI诊断开发计划》T0.3，已全部达成）

- 第 2 轮无需工具即答出第 1 轮回显字符串（会话记忆）
- resume 模式在全新进程中答出同一字符串（checkpoint 持久化）
- 模型配置全程来自 `acm.ai_model_config` 默认行（控制台打印配置名与掩码 Key）
- anthropic 协议配置（如 kimi-for-coding）经 ChatAnthropic 正常对话与工具调用
- streamEvents 出现 `on_chat_model_stream` / `on_tool_start` / `on_tool_end` 等事件（SSE 映射可行）
- PG `checkpoints` 表可见 poc-1 / poc-2 线程记录（PostgresSaver setup 幂等建表）
- 未配置默认模型时明确报错"未配置默认 LLM 模型"（无环境变量兜底语义）

## 文件说明

| 文件 | 职责 |
| --- | --- |
| `env.ts` | 加载 backend/.env.local → backend/.env → 根 .env |
| `seed-model-config.ts` | 种子脚本：命令行 Key → AES-256-GCM 加密 → upsert 默认配置 |
| `resolve-config.ts` | 生产 resolve 链路原型：默认行 → 解密 → 构建参数 |
| `tools.ts` | echo / get_server_time 最小工具（zod schema） |
| `checkpointer.ts` | PostgresSaver（ACM_DB_URL，setup 幂等建表）+ 连接池清理 |
| `index.ts` | 主流程入口（默认 / resume 两模式），含协议分派构建模型 |
| `migrate-mysql-to-pg.ts` | 一次性：MySQL acm 配置行 → PG（密文兼容直搬） |

## M2/M3 门禁决策输入

- `require('deepagents')`（CJS←ESM）在 Node 22 原生可用 → T2.1 无需动态 import 降级
- checkpointer 定型 PostgresSaver：无 TTL → T2.8 会话管理实现 deleteThread 定期清理
- agent-factory 需按 protocol 分派模型客户端（anthropic 端点 ChatOpenAI 打不通）
- streamEvents 事件流结构 → T2.8/T3.2 SSE 协议映射的事件来源已验证
- 镜像基座须 node:22（openai@7 引擎要求 + npm 10.8 残缺安装 bug）
