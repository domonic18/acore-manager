# acore-manager AI 诊断与 Agent 架构设计

> 版本：v1.3（2026-09-22）
> 变更：v1.3 acm 库迁移 PostgreSQL（T0.3：RedisSaver 需 RedisJSON/RediSearch 模块不可用）——checkpointer 改 PostgresSaver（checkpoint 三表随 PostgresSaver 自管）、对话正本与 checkpoint 同库；模型客户端按配置协议分派（openai→ChatOpenAI / anthropic→ChatAnthropic）；镜像基座 node:20→node:22；新增 acm-postgres（5433）为第四存储
> 对应需求：[requirements/01-log-upload-ai-diagnosis-requirement.md](../requirements/01-log-upload-ai-diagnosis-requirement.md)（v2.5）
> 关联文档：[01整体架构.md](./01整体架构.md)、[02后端架构.md](./02后端架构.md)、[04部署架构.md](./04部署架构.md)

## 一、设计目标与原则

### 1.1 范围

本文档覆盖日志上传与 AI 诊断需求的架构设计：游戏服日志采集上传（COS）、deepagents AI Agent 助手（对话）、SCF Job 函数每日巡检、定向分析（账号申诉分析）、白名单工具层、误报防控、LLM 配置与 Token 计量、诊断报告与前端呈现。

### 1.2 设计原则

| # | 原则 | 落地方式 |
|---|------|---------|
| 1 | **同栈单体** | Agent 运行时嵌入 ACM Express 单体（Node.js），与现有 API 同进程；巡检以同一镜像的 Job 形态运行 |
| 2 | **AI 出意图，代码出 SQL / 判断** | 工具白名单 + SQL 写死 + 参数化绑定；误报规则表、光环对照表内置代码，AI 只消费结论 |
| 3 | **游戏库只读，acm 库可写** | TypeORM 游戏三库（MySQL）连接保持 SELECT-only；新增 acm PostgreSQL 数据源承载报告 / 会话 / 配置 / 审计 / checkpoint |
| 4 | **全链路可回放** | 每次工具调用（参数 / 耗时 / 行数）写入 ai_tool_audit；对话正本落 acm 库 |
| 5 | **失败可降级** | SSE→非流式、DB 聚合缺表→日志为源，均不阻塞核心链路；checkpoint 与正本同库（acm PG），无独立易失状态 |
| 6 | **Token 成本可控** | grep-first skills、结构化解析工具、调用预算、Token 计量与日预算告警 |

---

## 二、总体架构

### 2.1 组件视图

```
┌────────────────────────────────────────────────────────────────────────┐
│ 游戏服主机（acore-deploy）                                               │
│  Appender 改造(a+时间戳) │ cron 05:00 上传脚本(coscli+copytruncate)       │
│  docker logs 按天导出    │ ──打包 tar.gz + manifest.json──┐              │
└──────────────────────────────────────────┼─────────────────────────────┘
                                           ▼
                              ┌────────────────────────┐
                              │  腾讯云 COS              │
                              │  acore-logs/   (90天)    │
                              │  acore-ai-reports/(1年)  │
                              └───────────┬────────────┘
                                          │ ②get_log_manifest / fetch_log_archive
┌─────────────────────────────────────────▼──────────────────────────────┐
│ ③ SCF Job 函数（定时触发器 06:00，Job 专用镜像，一次性执行后退出）           │
│   inspection.service → Agent 运行时（与 Web 函数同一份代码，独立镜像构建）    │
│   全 agentic 日志分析 → 白名单工具 → 报告 JSON+MD                          │
└───────────────┬──────────────┬───────────────┬────────────────────────┘
                │ ④白名单只读查询  │ ⑤报告落库       │ ⑥日报/告警
                ▼               ▼                ▼
     ┌─────────────────┐  ┌────────────┐  ┌────────────┐
     │ AzerothCore MySQL│  │ acm 库(PG)  │  │ 飞书机器人   │
     │ auth/characters/ │  │ (可写)      │  └────────────┘
     │ world (仅 SELECT)│  │ 6+1 张表+   │
     └─────────────────┘  │ checkpoint  │
                          └─────▲──────┘
                                │ ⑦API
┌───────────────────────────────┴────────────────────────────────────────┐
│ ⑧ SCF Web 函数（ACM 单体镜像，CMD 监听 9000）                             │
│  Express :9000                                                          │
│   ├─ 现有 API（账号/角色/GM 工具/审计…）                                   │
│   ├─ /api/ai/assistant/*    SSE 对话 + deepagents 运行时                   │
│   ├─ /api/ai/diagnosis/*    报告 / 巡检触发 / 上传状态                      │
│   └─ /api/ai/model-config/* 模型配置 / Token 用量                          │
└──────────────┬───────────────┬───────────────────┬─────────────────────┘
               │               │                   │
        ┌──────┴──────┐  ┌─────┴──────┐   ┌────────┴────────┐
        │ Redis        │  │ LLM API    │   │ ACM 前端          │
        │ (缓存)       │  │ 按协议分派   │   │ 助手对话 / 诊断报告 │
        └──────────────┘  └────────────┘   └─────────────────┘
```

### 2.2 与现有架构的关系

- **进程内扩展，不新增常驻服务**：Agent 运行时是 Express 进程内的一个模块族（`backend/src/agent/`），复用现有 JWT 鉴权、GM 等级守卫、pino 日志与 TypeORM 连接管理；Redis 仅作缓存（ranking 共享实例）
- **镜像分工**：Web 形态沿用前后端合一的单镜像（基座 **node:22-alpine**——deepagents 传递依赖 openai@7 要求 node≥22，见 M0-Spike结论；CMD `node dist/server.js`，监听 9000，无需额外入口脚本）；Job 形态按腾讯云 Job 函数要求使用**独立镜像** `docker/Dockerfile.job`（复用同一份后端构建产物，不含前端静态资源与字体依赖，CMD `node dist/job/inspection-job.js`，一次性执行后退出）
- **新增外部依赖三类**：COS（已有腾讯云生态）、LLM API（按配置协议分派：openai 兼容或 anthropic 兼容端点）与 acm PostgreSQL（新实例，本地 compose `acm-postgres`，生产腾讯云托管 PG）；Redis / AzerothCore MySQL 复用现有实例

---

## 三、后端模块设计

### 3.1 目录结构增量

> 目录组织的**唯一权威标准**为 [docs/standard/代码目录结构规范.md](../standard/代码目录结构规范.md)（含 `agent/` 与 `services/ai/` 边界判定、依赖方向、命名主线与禁令），本节仅给出 AI 域增量速览，二者冲突时以规范为准。

```
backend/src/
├── agent/                          # AI Agent 运行时机制（与业务编排分离）
│   ├── core/                       # 提示词加载、skills 目录加载器
│   ├── runtime/
│   │   ├── model-factory.ts        # 按协议分派模型客户端（openai→ChatOpenAI / anthropic→ChatAnthropic）
│   │   ├── agent-factory.ts        # createDeepAgent 组装 + 指纹 LRU 缓存
│   │   ├── checkpointer.ts         # PostgresSaver 单例（acm PG 库）
│   │   ├── budget-guard.ts         # 工具调用预算器（单任务实例）
│   │   └── wire.ts                 # streamEvents → SSE 事件映射
│   ├── tools/
│   │   ├── registry.ts             # 工具注册表（name/schema/handler/审计包装）
│   │   ├── db-tools/               # 10 个数据库白名单工具（SQL 写死）
│   │   ├── log-tools/              # manifest / fetch / anticheat 解析(explain)
│   │   └── inspection-tools.ts     # 触发巡检（对话场景）
│   ├── prompts/                    # 系统提示词（YAML）：assistant / inspection / analysis
│   ├── skills/                     # grep-first 日志检索方法论（对 agent 只读）
│   └── false-positive/
│       ├── aura-rules.ts           # 移动类光环对照表（代码内置初稿）
│       └── explain.ts              # 误报解释引擎（aura/地图/延迟/白名单）
├── services/ai/                    # AI 域业务编排（域分组）
│   ├── inspection.service.ts       # 巡检编排（触发/重试/落库/推送）
│   ├── targeted-analysis.service.ts # 定向分析编排（账号申诉分析，SSE）
│   ├── ai-report.service.ts        # 报告查询 / 幂等 upsert / 管理
│   ├── llm-config.service.ts       # 模型出口配置（加密存取/指纹/测试连接）✅ 已建
│   ├── chat-session.service.ts     # 会话与消息正本
│   ├── token-usage.service.ts      # Token 计量与日预算告警 ✅ 已建
│   ├── feishu-notify.service.ts    # 飞书群机器人告警出口（预算/巡检失败/断传）✅ 已建
│   ├── cos.service.ts              # COS 读写（日志包 / 报告归档）
│   └── anticheat-exemption.service.ts  # 误报白名单 CRUD
├── entities/acm/                   # acm 库 TypeORM 实体（新增数据源）
│   ├── ai-report.entity.ts
│   ├── ai-model-config.entity.ts   # ✅ 已建
│   ├── ai-token-usage.entity.ts
│   ├── ai-chat-session.entity.ts
│   ├── ai-chat-message.entity.ts
│   ├── ai-tool-audit.entity.ts
│   ├── ai-targeted-analysis.entity.ts
│   └── ai-anticheat-exemption.entity.ts
├── job/
│   └── inspection-job.ts           # SCF Job 形态入口（一次性执行）
└── routes/                         # 薄路由：保持扁平 + ai- 前缀
    ├── ai-assistant.routes.ts      # SSE 对话 / 会话管理
    ├── ai-diagnosis.routes.ts      # 报告 / 手动触发 / 误报标注 / 上传状态
    ├── ai-analysis.routes.ts       # 定向分析（SSE 流式 / 历史查询）
    ├── ai-model-config.routes.ts   # 模型配置（gmlevel=3）✅ 已建
    └── ai-token-usage.routes.ts    # Token 用量报表（gmlevel=3）✅ 已建
```

依赖方向（单向，禁止反向）：`routes/` → `services/ai/` → `agent/` → `entities/` / `shared/`；`agent/` 内部不 import `services/`。

### 3.2 Agent 运行时

#### 3.2.1 组装（agent-factory）

```
createDeepAgent({
  model:        buildModelClient(cfg)   // 按协议分派：openai→ChatOpenAI(baseURL) / anthropic→ChatAnthropic(anthropicApiUrl)
  tools:        registry.export(),          // 14 个白名单工具
  systemPrompt: loadYaml('inspection' | 'assistant'),
  middleware:   [TodoListMiddleware],
  skills:       [skills 目录],               // grep-first 方法论
  backend:      CompositeBackend(State + Filesystem(/skills/ 只读路由)),
  permissions:  [deny write /skills/**],
  checkpointer: postgresSaver 单例,          // acm PG 库（PostgresSaver）
})
```

#### 3.2.2 指纹 LRU 缓存

模型配置变更无需重启——配置落库（ai_model_config），按出口指纹缓存 agent 实例：

```
fingerprint = sha256( protocol | baseUrl | modelName | sha256(apiKey) )

getAgent(cfg):
  lock:
    evict idle > 2h
    hit  → move to end, refresh lastUsed, return
    miss → build → 容量满则淘汰最旧（LRU）→ 存入
```

- 容量：`AI_AGENT_CACHE_SIZE`（默认 4，单管理员场景 1-2 即够）
- 巡检与对话共用同一工厂；Job 进程冷启动即构建，无缓存命中问题

#### 3.2.3 Checkpointer 与对话正本

| 存储 | 内容 | 说明 |
|------|------|------|
| acm PG 库（`@langchain/langgraph-checkpoint-postgres`，PostgresSaver 自管 checkpoints / checkpoint_blobs / checkpoint_writes 表） | LangGraph 线程状态（消息、todo、中间状态） | thread_id = 会话 ID；与对话正本同库，持久化由 PG 保障。T0.3 结论：原 RedisSaver 方案硬依赖 RedisJSON / RediSearch 模块（本地 redis:7-alpine 与生产共享 Redis 均无）而弃用。PG 无自动 TTL——会话清理由后端定期 `deleteThread` 任务按保留策略删除（M2 会话管理范围） |
| acm PG 库（ai_chat_session / ai_chat_message） | 对话正本 | 每轮 assistant 回复完成后异步写入；会话列表 / 历史查询走 acm 库 |

#### 3.2.4 SSE 流式输出

```
POST /api/ai/assistant/chat   (Accept: text/event-stream)
  → agent.streamEvents(input, { threadId })
  → 事件转换器映射为 SSE 事件（见 5.2 事件协议）
  → SCF 不支持 SSE 时降级：同端点非流式返回完整结果（Accept 协商）
```

### 3.3 工具层设计

#### 3.3.1 注册表与审计包装

每个工具 = `{ name, description, schema(zod), handler }`，注册时统一包裹：

```
wrapped(args):
  budget.consume()                    // 超预算抛 ToolBudgetExceededError
  t0 = now; rows = await handler(validate(args))
  audit.writeAsync({ sessionId, tool, args, rows, costMs })   // 不阻塞主链路
  return rows
```

预算器（BudgetGuard）为**单任务实例**（一次巡检 / 一次对话链各自独立，默认 20 次）。

#### 3.3.2 数据库白名单工具（10 个）

- SQL 全部为代码内模板常量，参数经 zod 校验后绑定（TypeORM 参数化查询），游戏三库连接仅 SELECT
- 通用护栏：行数上限 50、超时 5s
- 工具清单见需求 3.5（get_character_overview / get_account_overview / get_login_ip_history / get_anticheat_record / get_character_auras / get_money_flow / get_mail_transfers / get_auction_activity / get_accounts_by_ip / get_character_associates / get_ban_history / get_metrics_snapshot 中按最终实现为 10+2 分组）
- `get_anticheat_record` 与 `get_character_auras` 的输出经**误报解释引擎**富化（3.5）

#### 3.3.3 日志工具（3 个）

```
fetch_log_archive(realm, date, type):
  cos.getObject(acore-logs/{realm}/{date}/{type}.tar.gz)
  → /tmp/ai-workspace/{realm}/{date}/{type}/  解压（大小上限校验）
  → return { files: [{path, lines}] }
  任务结束（finally）清理工作区

parse_anticheat_violations(dateRange, filters, explain):
  ① glob anticheat_*.log → 逐行正则解析（格式模块固定）
     { time, type, player, guid, latency, ip, mapId, coords }
  ② 聚合：玩家 × 违规类型 × 地图 → 计数 / 首末时间 / 延迟分布
  ③ explain=true → falsePositive.explain(suspects)（见 3.5）
  ④ return 聚合结果 + 每类摘录证据行（不返回原始全文）
```

`get_log_manifest` 读 COS manifest.json 并补充行数 / 首末时间戳摘要；Server / Errors / gm 等自由格式日志由 agent 内置 grep / read 工具在解压工作区内自主检索。

### 3.4 巡检编排（inspection.service）

```
runInspection({ realm, date, trigger: 'cron'|'manual'|'chat' }):
  1. 断传检查：COS manifest 存在且完整 → 缺失则飞书告警（继续分析已有部分）
  2. agent = await getAgent(默认模型出口, prompt=inspection)
  3. budget = new BudgetGuard(20)
  4. result = agent.invoke({ 任务指令 + skills 方法论 })
  5. 解析 agent 输出 JSON → schemaVersion 校验（失败 → 追问修复一轮，再失败则告警）
  6. reportService.upsert(realm, date, report)        # 幂等，UNIQUE(realm, report_date)
  7. cos.putObject(acore-ai-reports/{realm}/{date}.json|.md)
  8. redis 缓存最新报告摘要
  9. tokenUsage.record(inspection) → 超日预算 → 飞书告警
  10. 飞书日报卡片
  finally: 清理 /tmp/ai-workspace
```

- 失败重试：SCF 定时触发器配置重试 + 服务内退避重试（≥3 次），最终失败飞书告警，不阻塞次日
- 幂等：手动 / 对话重跑同日报告直接覆盖（upsert），报告页保留 updated_at

### 3.5 误报防控实现（false-positive/）

#### 3.5.1 移动类光环对照表（代码内置初稿）

```ts
// aura-rules.ts —— spell ID 开发时以 3.3.5 DBC 校准（带 * 者为待校准）
export const MOVEMENT_AURA_RULES = [
  { spells: [546, 3714*],           category: 'waterwalk', explains: ['Walk on Water'] },   // 萨满 WW / DK Path of Frost
  { spells: [782],                  category: 'swim-form',  explains: ['Walk on Water', 'Speed'] }, // 德鲁伊水栖形态
  { spells: [33943, 40120],         category: 'fly-form',   explains: ['Fly-Hack'] },        // 飞行 / 迅捷飞行形态
  { spells: [32223],                category: 'speed-mult', explains: ['Speed-Hack'] },      // 十字军光环
  { spells: [/* 骑乘加速物品光环 */], category: 'speed-mult', explains: ['Speed-Hack'] },      // 胡萝卜 / 马鞭等
  { spells: [/* 人类自利 / 亡灵意志 / PvP 饰品 */], category: 'cc-break',   explains: ['Ignore Control'] },
  { spells: [/* 缓降 / 工程披风 */],  category: 'slowfall',   explains: ['Teleport To Plane'] },
]
```

（782 / 40120 / 32223 已在本地库实测核实在用；其余占位 ID 开发时补齐。）

#### 3.5.2 解释引擎（explain）

```
explain(suspect):
  signals = []
  auras   = 查 character_aura（存库快照）
  for violation in suspect.violations:
    if auras ∩ 对照表[violation.type]      → signals.push({ kind: 'aura', spell, type })
    if 易误报地图配置 ∋ suspect.maps        → signals.push({ kind: 'map', mapId })
    if suspect.latencyP75 > 100ms          → signals.push({ kind: 'latency' })
    if 白名单命中(guid, type, mapId)        → signals.push({ kind: 'exemption' })
  return signals          # 非空 → 报告层强制 suggestedAction ≠ 'ban'
```

四层信号全部代码判定，AI 只读取结果写入报告的 `falsePositiveSignals` 字段。

### 3.6 定向分析编排（targeted-analysis.service）

账号申诉场景：玩家被封后在论坛申诉，GM 针对单一角色/账号发起定向取证分析，结论落库并可复制到论坛回复。

| 维度 | 每日巡检（3.4） | 定向分析（3.6） |
|------|---------------|----------------|
| 输入 | realm + 日期 | 昵称或账号 ID + 时间范围（默认封禁日前 7 天至当天） |
| 提示词 | inspection.yaml | analysis.yaml（聚焦单目标取证） |
| 工具集 | 白名单 DB/日志工具 | **完全复用，无新增** |
| 输出落库 | ai_report（UNIQUE upsert） | ai_targeted_analysis（**追加不覆盖**，保留多轮申诉记录） |
| 执行形态 | Job 函数（06:00 定时） | Web 函数 SSE 流式（与对话一致） |

```
runTargetedAnalysis({ subject, timeFrom, timeTo, trigger }):
  1. get_character_overview / get_account_overview 定位目标（昵称→guid，含封禁背景）
  2. agent = await getAgent(默认模型出口, prompt=analysis)
  3. agent.streamEvents: 封禁时段违规 → 行为画像 → 经济/团伙关联 → 误报核查（explain 四层信号）
  4. 结论 JSON schema 校验（analysisSuggestion ∈ maintain/lift/downgrade/manual_review；
     falsePositiveSignals 非空 → 强制降级为 manual_review，不得为 maintain）
  5. ai_targeted_analysis 追加落库（conclusion_json + conclusion_markdown + token_usage）
  6. 前端结果页展示 + 一键复制 Markdown（论坛申诉回复用）
```

- 中断恢复：SSE 断开或异常 → status=failed，可重新发起（追加新记录，不覆盖历史）
- 全程只读：不改变账号封禁状态，解封仍由 GM 在账号管理页人工执行

---

## 四、数据模型（acm 库，PostgreSQL）

新建数据源 `acm`（**PostgreSQL 独立实例**——T0.3 结论：RedisSaver 需 Redis 模块不可用，acm 库随 checkpoint 存储一并迁 PG，与游戏 MySQL 隔离；连接串 `ACM_DB_URL`，本地 compose 服务 `acm-postgres`（5433），生产用腾讯云托管 PG），TypeORM 实体与表如下；建表由 `docker/database/migrations/*.sql` 迁移文件 + runner（`npm run db:migrate`，`acm_migrations` 留痕表）负责，**不使用 synchronize**（遵循 `docs/standard/数据库操作规范.md`）；另有 PostgresSaver 自管的 checkpoint 三表（不纳入迁移体系）。

### 4.1 ai_model_config（模型出口配置，字段已对齐 ai-invest-assisstant 模式 / M0 已落表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK autoincrement | |
| name | varchar(100) UNIQUE | 配置名（如 glm-flash） |
| provider | varchar(20) | zhipu / deepseek / kimi / openai / anthropic / custom（预设自动填充 baseUrl+protocol） |
| protocol | varchar(20) | openai / anthropic |
| base_url | varchar(500) | 出口地址 |
| model_name | varchar(100) | 模型名自由输入 |
| api_key_encrypted | text | AES-256-GCM 加密存储；编辑留空=保留原值（write-only），接口回显仅掩码（前 4+***+后 4） |
| temperature / max_tokens | decimal(3,2) / int | 采样参数，可空 |
| is_default / is_active | boolean | 默认出口唯一（设默认清除其他行）；is_default 隐含 is_active |
| last_tested_at / last_test_status / last_test_error | | 测试连接结果落库（真实 HTTP 探测：openai 协议 POST /chat/completions、anthropic 协议 POST /v1/messages（x-api-key + anthropic-version 头），max_tokens=1，15s 超时） |
| created_by / created_at / updated_at | | gmlevel=3 可改 |

行为规则：无默认可用配置时明确报错"未配置默认 LLM 模型"，**无环境变量兜底**（首启由管理员在后台新增并设默认）；删除默认行时自动提升首个 is_active 行。

### 4.2 ai_token_usage（Token 计量）

id、date（分区/索引）、scene（chat / inspection）、ref_id（session_id 或 巡检任务 id）、model、prompt_tokens、completion_tokens、total_tokens、duration_ms、created_at。
日预算检查：`SELECT SUM(total_tokens) WHERE date = today` 超阈值 → 飞书告警。

### 4.3 ai_chat_session / ai_chat_message（对话正本）

- session：id、user_id、thread_id（= 会话 id，对应 PG checkpoint thread）、title（首条消息截断）、realm、created_at、last_active_at
- message：id、session_id（FK）、role（user / assistant / tool）、content（TEXT）、tool_name / tool_args_json（role=tool 时）、tokens、created_at

### 4.4 ai_tool_audit（工具调用审计）

id、ref_id（session / 任务）、tool_name、args_json、row_count、duration_ms、status（ok / error / budget_exceeded）、error、created_at。
巡检与对话共用；报告页"证据链回放"按 ref_id 读取。

### 4.5 ai_report（诊断报告）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| realm + report_date | | **UNIQUE(realm, report_date)**，幂等 upsert 键 |
| schema_version | int | 报告结构版本 |
| health_score | int | 0-100 |
| summary | varchar | 一句话总结（列表页用） |
| content_json | JSON | 结构化报告（含 suspiciousPlayers / falsePositiveSignals） |
| content_markdown | TEXT | Markdown 全文（详情页查看 + 一键复制） |
| gm_remark | TEXT | GM 处置备注（PUT 修改，gmlevel=3；AI 内容字段不可改） |
| token_usage | JSON | 本次巡检消耗 |
| generated_by | varchar | cron / manual / chat |
| status | varchar | ok / failed |
| created_at / updated_at | | 重跑覆盖更新 updated_at |

### 4.6 ai_anticheat_exemption（误报白名单）

id、character_guid、violation_type、map_id（可空=不限地图）、reason、created_by、created_at；UNIQUE(character_guid, violation_type, map_id)。
GM 在报告页标注写入；`get_anticheat_record` 与 explain 引擎读取。

### 4.7 ai_targeted_analysis（定向分析结论）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| realm | varchar | 区服 |
| subject_type | varchar | character / account |
| subject_name / subject_guid | varchar / int | 目标昵称与解析后的 guid（account 分析时存账号名/ID） |
| time_from / time_to | datetime | 分析时间范围 |
| status | varchar | running / ok / failed |
| conclusion_json | JSON | 结构化结论（analysisSuggestion / evidence / falsePositiveSignals） |
| conclusion_markdown | TEXT | Markdown 全文（论坛回复复制用） |
| token_usage | JSON | 本次分析消耗 |
| triggered_by | varchar | 发起 GM 账号 |
| gm_remark | TEXT | 申诉处置备注（已回帖 / 已解封 / 已驳回等） |
| updated_at | datetime | Markdown 润色 / 备注编辑留痕；conclusion_json 保持 AI 原始输出不可改 |
| created_at | datetime | **追加语义**：每次发起新增一行，不覆盖历史 |

---

## 五、接口设计

### 5.1 路由清单（统一 `{success, count, data}` 包装，JWT + GM 守卫）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | /api/ai/assistant/chat | gmlevel≥2 | SSE 对话（Accept 协商降级非流式） |
| GET | /api/ai/assistant/sessions | gmlevel≥2 | 会话列表 |
| GET | /api/ai/assistant/sessions/:id/messages | gmlevel≥2 | 历史消息（MySQL 正本） |
| DELETE | /api/ai/assistant/sessions/:id | gmlevel≥2 | 删除会话（连带 deleteThread 清理 PG checkpoint） |
| POST | /api/ai/analysis/targeted | gmlevel≥2 | 发起定向分析（SSE，事件协议同 5.2） |
| GET | /api/ai/analysis/targeted | gmlevel≥2 | 定向分析历史列表（分页） |
| GET | /api/ai/analysis/targeted/:id | gmlevel≥2 | 定向分析结论详情（JSON + Markdown） |
| PUT | /api/ai/analysis/targeted/:id | gmlevel=3 | 更新处置备注 / 润色 conclusion_markdown（审计） |
| DELETE | /api/ai/analysis/targeted/:id | gmlevel=3 | 删除定向分析记录（二次确认，审计） |
| PUT | /api/ai/diagnosis/reports/:realm/:date | gmlevel=3 | 更新 GM 处置备注（AI 内容不可改） |
| DELETE | /api/ai/diagnosis/reports/:realm/:date | gmlevel=3 | 删除报告（Redis 摘要失效；COS 归档保留；审计） |
| POST | /api/ai/diagnosis/inspection/trigger | gmlevel=3 | 手动触发指定日期巡检 |
| GET | /api/ai/diagnosis/reports | gmlevel≥2 | 报告列表（分页，Redis 摘要） |
| GET | /api/ai/diagnosis/reports/:realm/:date | gmlevel≥2 | 报告详情（JSON + Markdown） |
| GET | /api/ai/diagnosis/reports/:realm/:date/markdown | gmlevel≥2 | 原始 .md（一键复制用） |
| POST | /api/ai/diagnosis/false-positive | gmlevel≥2 | 标记误报（写入白名单） |
| GET | /api/ai/diagnosis/upload-status | gmlevel≥2 | 近 7 天上传完整性 |
| GET/PUT | /api/ai/model-config | gmlevel=3 | 模型出口配置 |
| GET | /api/ai/token-usage?from&to | gmlevel=3 | Token 用量报表 |

### 5.2 SSE 事件协议

| event | data | 说明 |
|-------|------|------|
| `delta` | `{ text }` | 增量回复文本 |
| `tool_call` | `{ name, args }` | 工具开始（前端可展示"正在查询…"） |
| `tool_result` | `{ name, rowCount, durationMs }` | 工具结束（不含数据本体） |
| `step` | `{ todos }` | write_todos 计划更新 |
| `done` | `{ sessionId, messageId, tokens }` | 本轮结束 |
| `error` | `{ message, code }` | 错误（含 budget_exceeded） |

---

## 六、前端架构增量

### 6.1 新增 feature

```
frontend/src/features/
├── ai-assistant/
│   ├── AIAssistantPage.tsx        # 对话主页面
│   ├── components/Thread.tsx      # assistant-ui 会话组件
│   ├── runtime/langgraph-runtime.ts  # @assistant-ui/react-langgraph 适配（SSE）
│   └── hooks/useSessions.ts
└── ai-diagnosis/
    ├── ReportListPage.tsx         # 列表（日期/评分/异常数/可疑数）
    ├── ReportDetailPage.tsx       # 详情 Tab：服务器健康 / 可疑玩家 / 处置建议
    │                              # + Markdown 视图与"复制 Markdown"按钮
    ├── components/SuspiciousPlayerTable.tsx   # 多选 → 批量警告邮件 / 标记误报
    ├── components/FalsePositiveDialog.tsx
    ├── components/ReportManageActions.tsx     # 处置备注编辑 / 删除（二次确认输入文字，gmlevel=3）
    ├── TargetedAnalysisPage.tsx    # 定向分析：发起表单 + SSE 进度 + 历史列表
    ├── components/AnalysisResult.tsx          # 结论展示 + analysisSuggestion 徽标 + 复制 Markdown
    └── hooks/useReports.ts
```

### 6.2 关键交互

- **复制 Markdown**：`GET .../markdown` 取原文 → `navigator.clipboard.writeText`，失败降级 `document.execCommand('copy')`；成功 toast 提示可直接粘贴论坛
- **定向分析**：账号/角色详情页"发起 AI 分析"按钮预填昵称与封禁日期跳转；结果页 `analysisSuggestion` 徽标展示，`falsePositiveSignals` 非空时强制提示"存在误报信号，建议人工复核"
- **报告管理**：列表行"删除"与详情页"处置备注"编辑仅 gmlevel=3 可见；删除二次确认要求输入确认文字；定向分析结果页 Markdown 可编辑保存后再复制（conclusion_json 不可改）；写操作全量经审计中间件落 GM 操作日志
- **可疑玩家表**：`falsePositiveSignals` 非空时行首展示"疑似误报"徽标；`suggestedAction=ban` 且无信号时才高亮封禁按钮
- **权限映射**：对话 / 报告查看 gmlevel≥2；触发巡检 / 模型配置 / Token 报表 gmlevel=3（路由守卫 + 菜单隐藏 + 按钮 usePermission 三层一致）
- 新增依赖：`@assistant-ui/react`、`@assistant-ui/react-langgraph`、`@assistant-ui/react-markdown`

---

## 七、部署架构增量（SCF）

### 7.1 双形态双镜像

| 形态 | 触发 | 镜像与入口 | 生命周期 |
|------|------|------|---------|
| Web 函数 | HTTPS | 单体镜像 `docker/Dockerfile` → `node dist/server.js`（监听 9000） | 常驻，承载 API + 静态资源 + SSE 对话 |
| Job 函数 | 定时触发器（06:00）+ 手动触发端点 | Job 专用镜像 `docker/Dockerfile.job` → `node dist/job/inspection-job.js` | 一次性：执行巡检 → 退出 |

两镜像共享同一份后端构建产物与业务代码，仅入口与打包内容不同；TCR 分 tag 管理。

### 7.2 资源与环境变量增量

```bash
# 部署增量环境变量
ACM_SYSTEM_DB=acm             # 系统库名
COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION
AI_TOOL_CALL_BUDGET=20        # 单任务工具调用预算
AI_TOKEN_DAILY_BUDGET=500000  # Token 日预算（告警阈值）
AI_AGENT_CACHE_SIZE=4
FEISHU_WEBHOOK / FEISHU_SECRET
LLM_AES_KEY                   # ai_model_config.api_key 加密密钥
```

- Job 函数：内存 ≥ 1GB（日志解压 + agent 上下文）、超时以实测为准（开放问题 3；超限则按日志类型拆多次 Job）、/tmp 需容纳解压后日志
- Web 函数：验证 SSE 支持（开放问题 2），不支持则前端降级非流式

---

## 八、关键时序

### 8.1 对话（含工具调用与审计）

```
GM 浏览器                Web 函数(Express)                LLM / acm PG / MySQL
   │  POST /chat (SSE)        │                                │
   ├─────────────────────────▶│ 鉴权+gmlevel 校验                │
   │                          │ getAgent(llmConfig) 指纹缓存     │
   │                          │ agent.streamEvents(threadId) ──▶│ LLM 流式
   │◀── delta/delta ──────────│◀── tokens ──────────────────────│
   │◀── tool_call(get_money_flow)                              │
   │                          │ BudgetGuard.consume             │
   │                          │ TypeORM 参数化查询（游戏库只读）    │
   │                          │ ai_tool_audit 异步落库            │
   │◀── tool_result ──────────│                                 │
   │◀── delta ... done ───────│ ai_chat_message 正本落库          │
   │                          │ token_usage 落库（日预算检查）      │
```

### 8.2 每日巡检（Job）

```
SCF Timer 06:00 → Job 容器(ENTRY_MODE=job)
  → 断传检查(COS manifest)
  → getAgent(默认模型)
  → agent.invoke: get_log_manifest → fetch_log_archive → parse(explain)
                  ↘ grep/read 自由日志 ↘ 10 个 DB 白名单工具
  → JSON schema 校验 → ai_report upsert → COS 归档 → Redis 摘要
  → token_usage 记录 → 飞书日报/告警 → 清理工作区 → 退出
```

### 8.3 定向分析（Web SSE）

```
GM 发起(表单/详情页按钮) → POST /api/ai/analysis/targeted (SSE)
  → 定位目标(get_character_overview / get_account_overview)
  → getAgent(prompt=analysis) → agent.streamEvents（tool_call/tool_result 过程可见）
  → 结论 JSON schema 校验（falsePositiveSignals 非空 → 强制 manual_review）
  → ai_targeted_analysis 追加落库 → done → 结果页复制 Markdown
中断/异常 → status=failed 落库，可重新发起（追加新记录）
```

---

## 九、降级矩阵汇总

| 故障场景 | 行为 | 用户体验 |
|---------|------|---------|
| SCF 不支持 SSE | 同端点非流式整段返回 | 对话无打字机效果，功能完整 |
| acm PG 不可用 | 对话 / 巡检均不可用（fail-fast） | 基础设施故障，恢复后自动重连 |
| LLM 调用失败 | 重试 3 次退避 → 飞书告警 | 当日报告缺失，历史可查 |
| daily_players_reports 为空 | get_anticheat_record 降级当前聚合 | 日志解析为唯一权威来源 |
| logs / logs_ip_actions 为空 | 相关工具返回空并注明 | 不阻塞其余证据链 |
| 工具预算耗尽 | 后续调用返回 budget_exceeded | agent 基于已有信息收尾报告 |
| agent 输出 JSON 非法 | 追问修复一轮 → 失败告警 | 当日报告标记 failed，可重跑 |
| 定向分析执行中断 | status=failed 落库，历史保留 | 重新发起即追加新记录 |

---

## 十、架构文档索引更新

本文档加入 [01整体架构.md](./01整体架构.md) 第七章文档索引；需求文档关联文档同步指向本文。
