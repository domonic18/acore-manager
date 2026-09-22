# 日志上传与 AI 诊断 需求文档

> 版本：v2.5（2026-09-22）
> 变更：v2.5 **acm 库迁移 PostgreSQL**（T0.3 Spike 结论驱动）：T0.3 实测 `RedisSaver` 硬依赖 RedisJSON / RediSearch 模块（本地 redis:7-alpine 与生产共享 Redis 均无），acm 自有库由 MySQL 改为独立 PostgreSQL 实例（compose 服务 `acm-postgres`，生产用腾讯云托管 PG），checkpointer 改官方 `@langchain/langgraph-checkpoint-postgres`，checkpoint 与对话正本同库、无 TTL 语义改定期 deleteThread 清理；模型客户端按配置协议分派（openai → ChatOpenAI / anthropic → ChatAnthropic）；镜像基座 node:20 → node:22（openai@7 引擎要求 + npm 10.8 安装损坏 bug）；全局 "MySQL acm 库" 表述改为 "acm 库（PostgreSQL）"
> 变更：v2.4 新增**报告管理（增删改查）**（3.11）：每日巡检报告与定向分析结论统一管理——查 / 增沿袭现有能力，改支持 GM 处置备注（定向分析另可润色 Markdown，AI 结构化结论不可改）、删需二次确认；改 / 删 gmlevel=3 且全量审计；`ai_report` / `ai_targeted_analysis` 新增处置备注字段
> 变更：v2.3 新增**定向分析（账号申诉分析）**（3.8）：提供玩家昵称 / 账号 + 时间范围，Agent 复用反作弊核查链路工具做定向取证分析，输出结构化结论与 Markdown 并落库（acm 库 `ai_targeted_analysis`，追加式），结论可一键复制粘贴论坛回帖；原 3.8 / 3.9 顺延为 3.9 / 3.10
> 变更：v2.2 新增**误报防控设计**（3.5）：新增 `get_character_auras` 光环解释工具与代码内置误报规则表、解析器 explain 模式（地图聚合 / 延迟降权）、误报白名单表与 GM 标注闭环、报告 `falsePositiveSignals` 字段、ban 建议门槛（3.7）；工具集扩至 14 个
> 变更：v2.1 基于本地日志目录与 acore-mysql 三库实地勘察完善 AI 工具集（3.5）：数据库白名单工具扩至 10 个、日志工具新增 anticheat 结构化解析，按反作弊核查链路分组，附工具串联示例与数据边界备注；Redis AOF 决策为不开启（3.3 / 开放问题 4）
> 变更：v2.0 重大改版——新增 AI Agent 助手对话与 deepagents 运行时（3.3）；每日巡检改为 SCF Job 函数定时触发、全 agentic 日志分析、报告落库（3.4）；数据库访问改为统一白名单工具在线查询，废弃"转录到本地"（3.5）；新增 LLM 后台配置与 Token 计量（3.6）；前端新增助手对话页与报告 Markdown 一键复制同步论坛（3.7）；游戏服侧新增 Appender 配置改造与 docker logs 崩溃导出（3.1）
> 状态：待评审
> 关联文档：`requirements.md`、`arch/04部署架构.md`、`arch/06AI诊断与Agent架构.md`

## 1. 背景与目标

当前线上 AzerothCore 游戏服务器（worldserver / authserver）的运行日志只存在于游戏服主机本地，排查问题需要登录服务器手工翻日志；同时缺少对**异常行为（如玩家使用作弊工具）**的系统化发现手段，主要依赖玩家举报和 GM 巡场。

本需求引入三条能力链路：

1. **日志上链路（采集）**：游戏服主机定时将运行日志上传至腾讯云 COS，形成集中、可追溯的日志归档。前置进行 Appender 配置改造，保证日志可追加、带时间戳、重启不丢。
2. **AI 巡检链路（诊断）**：腾讯云 SCF Job 函数每日定时触发 AI Agent，全 agentic 阅读原始日志、经白名单工具在线查询数据库，产出服务器健康诊断报告并**落库到系统自有数据库**，重点识别作弊行为等异常信号，通过报告页与飞书推送呈现给 GM。
3. **AI Agent 助手链路（交互）**：ACM 内置对话式 AI 助手（deepagents 运行时，与后端同为 Node.js 技术栈），GM 以自然语言查询线上状态、触发巡检与报告生成；报告以 Markdown 呈现并支持一键复制，便于直接粘贴同步到论坛。

**核心价值**：

- 服务器异常（报错、崩溃、性能劣化）从"被动发现"变为"每日主动诊断"
- 作弊行为从"玩家举报驱动"变为"日志证据驱动"，GM 可按证据链核查处置
- GM 从"看报告"升级为"随时问"：自然语言即可完成巡检触发与疑点深挖
- 巡检结论一键复制 Markdown，可直接同步论坛公告，运营触达成本趋零
- 处置形成"AI 诊断 → 警告邮件 → 人工核查 → 封禁"的渐进链路，先警告后封禁，减少误伤
- 日志断传可作为游戏服宕机的早期信号，附带兜底告警能力

## 2. 整体流程

```
游戏服主机
（Appender 改造：a 追加模式 + 时间戳；copytruncate 轮转；
  docker logs 按天导出崩溃数据；cron + coscli）
   │ ①每日 05:00 打包上传（含 manifest.json）
   ▼
腾讯云 COS 日志归档桶（acore-logs/realm3/{yyyy-mm-dd}/，保留 90 天）
   │ ②get_log_manifest / fetch_log_archive（Agent 工具拉取解压）
   ▼
SCF Job 函数（定时触发器，每日 06:00）
   │ 与 Web 函数共用同一份 agent 代码包（deepagents 运行时）
   │ ③全 agentic：grep-first 精读原始日志，不做程序预处理
   │ ④白名单只读工具在线查询数据库（AI 出意图，代码出 SQL）
   ▼
AzerothCore DB（auth / characters / world，账号仅 SELECT）
   │ ⑤报告落库（按 realm+日期幂等 upsert）
   ▼
acm 库（PostgreSQL 新建实例，ACM 自有可写库，与游戏 MySQL 隔离）
（ai_report / 会话 / 模型配置 / Token 用量 / 工具审计 / LangGraph checkpoint）
 + COS 报告归档（.json / .md）+ Redis 最新报告缓存
   │                    ⑥日报摘要 / 断传 / 失败 / Token 预算告警
   │                    ──────────────────▶ 飞书机器人
   │ ⑦API（SSE 对话 / 报告 / 配置）
   ▼
SCF Web 函数（ACM 单体 + deepagents 对话运行时）
   │
   ▼
ACM 前端
（AI 助手对话页：自然语言查询 / 触发巡检；
  AI 诊断报告页：报告查看 + 一键复制 Markdown → 论坛粘贴）
```

## 3. 功能需求

### 3.1 日志采集与上传（游戏服侧）

**需求描述**：在游戏服主机部署日志上传脚本，由系统 cron 定时执行，将日志归档上传至 COS。上传脚本独立于 ACM 运行，游戏服与 ACM 任一故障都不影响另一端的可观测性。

**前置改造：Appender 配置（M1 工作项）**

经本地部署（`acore-deploy`）核实，当前配置存在两个致命问题：多数 Appender 为 `w` 模式（worldserver 每次重启即截断文件），且 flags=0（日志行**无时间戳**）；而 healthcheck 与 watchdog 会自动重启 worldserver，导致日志丢失且无法对时。改造约定：

| Appender | 现状 | 目标 |
|----------|------|------|
| Server（worldserver） | `Server.log`，w 模式，无时间戳 | a 模式 + 时间戳 flags（参照 anticheat 的 39） |
| Errors（worldserver） | `Errors.log`，w 模式，无时间戳 | 同上 |
| GM（worldserver） | `gm.log`，a 模式，无时间戳 | 加时间戳 flags |
| Auth（authserver） | `Auth.log`，w 模式，无时间戳 | a 模式 + 时间戳 flags |
| Anticheat | 按天命名 `anticheat_YYYY-MM-DD.log`，a 模式，带时间戳 | 已符合，不改 |

- AzerothCore 不会重新打开日志文件句柄，**不能使用 rename 式 logrotate**；统一采用 **copytruncate**（复制后清空原文件）轮转，由上传脚本负责
- 改造后需验证：重启 worldserver 后 `Server.log` 历史保留、新条目带时间戳

**上传范围**（全部启用，路径可配置）：

| 日志类型 | 默认文件 | 用途 |
|---------|---------|------|
| worldserver 日志 | `Server.log`、`Errors.log`、`gm.log` | 运行错误、脚本异常、聊天、GM 命令 |
| authserver 日志 | `Auth.log`（实测仅含启动横幅）+ authserver stdout（docker logs 导出） | 登录失败、爆破尝试、IP 记录 |
| 反作弊模块日志 | `anticheat_YYYY-MM-DD.log`（已确认安装启用，格式已核实） | 作弊检测的核心数据源 |
| 崩溃数据 | `docker logs` 按天导出 | 稳定性诊断 |

- **反作弊日志**：检测结果输出到日志文件（日志为唯一数据源），已按天命名且带时间戳 / 等级 / 玩家 / GUID / IP / 坐标。其按天归档（archive）当前由生产环境 cron 完成——职责需收敛为**上传脚本（copytruncate）统一接管轮转，旧 cron 下线**，避免与 05:00 上传产生竞争（交接细节见开放问题 1）
- **崩溃数据源**：宿主机无 CrashReport 落盘，改为每日由上传脚本执行 `docker logs --since <前一日>` 导出 worldserver / authserver 标准输出，打包为 `crash.tar.gz`（要求上传脚本具备宿主机 docker CLI 权限）。注意：authserver 的登录 / 失败登录事件仅输出到 stdout，此通道是其唯一日志证据来源

**上传策略**：

- 每日凌晨（默认 05:00，可配置）打包上传**前一日完整日志**（tar.gz 压缩）
- 按天归档，文件名包含日期与类型，失败重试 ≥ 3 次（退避递增）
- 上传完成后写入校验信息（文件大小 / md5），供 ACM 侧完整性校验
- 上传成功后可选清理本地已归档日志（保留 N 天，默认 7 天，可配置）

**COS 目录规范**：

```
{bucket}/acore-logs/realm3/{yyyy-mm-dd}/
  ├── worldserver.tar.gz
  ├── authserver.tar.gz
  ├── anticheat.tar.gz
  ├── crash.tar.gz
  └── manifest.json        # 文件清单+大小+md5+行数，供校验与 Agent 检索
```

（realm 目录默认 `realm3`，多 realm 预留）

**安全要求**：

- COS 桶**私有读写**，日志含玩家 IP、聊天内容等敏感信息
- 使用腾讯云 CAM 子账号，最小权限：仅该桶 `acore-logs/*` 前缀的写入权限
- 脚本凭证存放于游戏服主机受保护路径（`~/.coscli` 等），不进入代码仓库

### 3.2 日志断传监控（ACM 侧兜底）

**需求描述**：日志"当天没传上来"往往意味着游戏服宕机或上传链路故障，ACM 需要主动检测。

**具体功能**：

- 检查随巡检 Job（3.4）前置执行：每日检查 COS 中前一日 realm3 的 `manifest.json` 是否存在且完整
- 缺失或不完整时，通过飞书推送**断传告警**（区分级别：仅部分文件缺失 / 整日无上传）
- 前端诊断页展示最近 7 天的上传状态（各类型日志是否到齐）

### 3.3 AI Agent 助手（对话巡检，新增）

**需求描述**：ACM 内置对话式 AI 助手，GM 以自然语言查询线上状态、触发巡检并生成报告。运行时复用既有项目验证过的 **deepagents 框架（Node.js 版，npm `deepagents`）**，与 ACM 后端保持同一技术栈；前端复用 assistant-ui React 组件。对话与定时巡检共用同一套 agent 定义、系统提示词与工具集。

**具体功能**：

- **对话入口**：前端新增"AI 助手"页（assistant-ui），SSE 流式输出（SCF Web 函数对 SSE 的兼容性需先验证，见开放问题 2；不支持则降级非流式整段返回）
- **能力**：
  - 自然语言查询：经白名单工具查询在线数据（角色 / 账号画像、登录 IP 历史、金币流水 / 邮件 / 拍卖、社交团伙、反作弊聚合、处置历史 / 运营概览）
  - 触发巡检：指令式触发指定日期的巡检与报告生成（权限见 3.7），完成后引导跳转报告页
  - 定向分析：按玩家昵称 / 账号 + 时间范围发起申诉取证分析（详见 3.8），完成后引导跳转结论页
  - 服务器状态问答：基于巡检报告与上传状态回答"昨天服务器怎么样"
- **运行时组装**（参考 ai-invest-assisstant 项目模式）：
  - `deepagents` 的 `createDeepAgent` 组装：模型（后台配置，见 3.6）、系统提示词（YAML 管理）、白名单工具（3.5）、日志工具（3.4）、TodoList 中间件、skills 目录（grep-first 日志检索方法论，对 agent **只读**，禁止写入）
  - agent 实例按**模型出口指纹**（protocol | base_url | model | api_key 哈希的 SHA256）LRU 缓存 + 闲置淘汰；后台修改模型配置后指纹变化自动重建实例，无需重启服务
  - 会话状态（LangGraph checkpoint）存 **acm PostgreSQL**（`@langchain/langgraph-checkpoint-postgres`。v2.4 原方案为 RedisSaver，T0.3 实测其硬依赖 RedisJSON / RediSearch 模块——本地 redis:7-alpine 与生产共享 Redis 均无模块，故随 acm 库迁 PostgreSQL 一并解决，无模块依赖）
  - **持久化决策**：checkpoint 与对话正本同库（acm PG），持久化由 PG 自身保障，不再依赖 Redis AOF。Redis 仅承载热点缓存（ranking 共享实例维持现状）。checkpoint 无自动 TTL，会话清理由后端定期 `deleteThread` 任务实现（M2 会话管理范围），历史会话按保留策略删除
  - 对话正本（会话与消息）落 acm 库，前端会话列表 / 历史以 acm 库为准
- **可观测**：每次对话记录 Token 消耗（3.6）；工具调用全量审计（3.5）

### 3.4 AI 每日巡检（Job 函数 + 全 agentic 分析）

**需求描述**：SCF Job 函数定时触发 AI Agent 执行每日巡检：全 agentic 阅读前一日原始日志、按需在线查询数据库、产出结构化诊断报告并落库。

**具体功能**：

- **触发方式**：
  - 定时：腾讯云 SCF **Job 函数**定时触发器（默认每日 06:00，可配置），拉起与 Web 函数**同一份 agent 代码包**执行巡检（进程内不再跑 node-cron，避免 SCF 非常驻实例漏跑）
  - 手动：报告页按钮或对话指令触发（gmlevel = 4），支持指定日期重跑 / 补跑
- **分析模式（全 agentic）**：不再做程序预处理聚合，agent 自主完成：
  1. `get_log_manifest` 读取 COS manifest，了解当日日志构成
  2. `fetch_log_archive` 按类型下载 tar.gz 并解压至临时工作区（任务结束清理）
  3. 内置 grep / read 工具按 skills 方法论（**grep-first**：先关键词定位、再精读片段）阅读原始日志
  4. 需要数据库佐证时调用白名单工具（3.5）
  5. 汇总产出结构化报告（JSON）+ Markdown 全文
- **Token 成本控制**：skills 方法论约束 grep-first；日志与 DB 工具单次返回行数上限；单次巡检工具调用预算（默认 20，可配置）；报告引用日志仅摘录证据片段
- **分析维度**：
  - **服务器健康**：错误 / 崩溃趋势、数据库错误、性能异常信号（在线人数分时趋势**首版不做**——无历史数据源）
  - **作弊行为检测**（重点）：
    - anticheat 违规：同一玩家高频 / 持续性触发速度、传送、飞行类违规（日志解析与 DB 聚合表 `players_reports_status` 互证，见 3.5）
    - 可疑登录：大量失败登录、非常用时段 / IP 的批量登录尝试
    - 数据库行为指标：快速升级、在线时长异常（bot 特征）、金币异常流动、同 IP 多账号
  - **输出结论**：每项异常附**证据片段**（原始日志摘录），给出严重级别（high / medium / low）与处置建议
- **报告落库**（本版新增，主存储由 COS 调整为数据库）：
  - 主存储：acm 库（PostgreSQL）`ai_report` 表（结构化 JSON + Markdown 全文），按 `(realm, report_date)` **幂等 upsert**，重跑覆盖并更新时间戳
  - 归档：COS `{bucket}/acore-ai-reports/realm3/{yyyy-mm-dd}.json|.md`（报告保留 1 年）
  - 缓存：最新报告摘要写 Redis 供列表页快速读取
- **报告核心结构**（JSON 约定，`schemaVersion` 版本化）：

  ```jsonc
  {
    "schemaVersion": 2,
    "reportDate": "2026-09-20",
    "realm": "realm3",
    "generatedAt": "...",
    "healthScore": 82,              // 0-100 服务器健康评分
    "summary": "一段话总结",
    "serverHealth": {
      "crashes": [],                 // 崩溃事件（docker logs）
      "errors": [],                  // 高频错误聚合
      "authAnomalies": []            // 可疑登录
    },
    "suspiciousPlayers": [           // 可疑玩家清单（重点）
      {
        "character": "...", "account": "...",
        "severity": "high",
        "suggestedAction": "warning",    // warning=提醒邮件 / investigate=人工核查 / ban=封禁
        "reasons": ["速度违规 143 次/日"],
        "evidence": ["原始日志片段..."],
        "falsePositiveSignals": [],      // 误报信号：解释性光环 / 易误报地图 / 高延迟 / 白名单命中；非空时 suggestedAction 禁止为 ban
        "suggestion": "建议人工核查后封禁"
      }
    ],
    "recommendations": [],           // 运维/处置建议
    "tokenUsage": { "prompt": 0, "completion": 0, "total": 0 }
  }
  ```

- **失败处理**：重试 ≥ 3 次；最终失败飞书推送"今日分析失败"告警，不阻塞次日任务；单日失败不影响历史报告查询

### 3.5 AI 数据库与日志访问隔离（统一白名单工具）

**需求描述**：巡检与助手对话共用同一套工具集。核心原则不变：**AI 出意图，代码出 SQL**。AI 全程不接触任何数据库连接，所有查询由 ACM 后端既有只读 repository 层执行，AI 只能在白名单范围内决定"查什么、传什么参数"，最坏情况也只是产生一次白名单内的怪查询，不可能是写操作。

**与 v1.3 的差异**：废弃"第一层固定快照预处理打包 + 数据库转录"模式，改为**统一白名单工具**——快照类指标封装为 `get_metrics_snapshot` 工具，由 agent 按需调用，降低复杂度。

**工具设计原则（基于本地环境实地勘察，2026-09-21）**：工具按反作弊核查链路分组——**发现 → 身份 → 画像 → 团伙 → 处置**，每个工具对应链路中的一步；全部数据源已在本地 acore-mysql 三库（auth / characters / world）与 `acore-deploy/logs` 目录核实存在。

**日志工具**（只读 COS + 临时工作区解压）：

| 工具 | 参数 | 用途 |
|------|------|------|
| `get_log_manifest` | 日期 | 读取 manifest.json：文件构成 / 完整性 / 行数 / 首末时间戳；anticheat 文件附违规类型分布摘要 |
| `fetch_log_archive` | 日期、类型 | 下载 tar.gz 并解压至临时工作区，返回可检索文件路径 |
| `parse_anticheat_violations` | 日期范围，可选玩家 / GUID / 违规类型过滤，`explain` 开关 | **代码级结构化解析** anticheat 日志：按 玩家 × 违规类型 × **地图** 聚合计数，附首次 / 末次时间、延迟分布、IP、坐标与原始证据行；`explain=true` 时对每个可疑玩家自动做**误报解释**（查 character_aura 移动类光环、易误报地图配置、误报白名单、延迟阈值，命中即标注）。理由：行格式由模块固定定义且量大，代码解析远省 token 且可跨天聚合；Server / Errors / gm 等非固定格式日志仍由 agent 内置 grep / read 自主检索（全 agentic） |

**数据库白名单工具**（SQL 全部写死在代码中，AI 仅传参数；"数据源"列均为实测存在的表）：

身份与行为画像：

| 工具 | 参数 | 数据源 | 用途 |
|------|------|--------|------|
| `get_character_overview` | 角色名 / guid | characters | 角色全貌：等级 / 种族职业 / 金钱 / 总在线时长（totaltime）/ 本级时长（leveltime）/ 创建时间（creation_date，可算练级速度）/ 在线状态 / 当前地图与坐标 / 延迟 / 击杀数 / 所属账号 |
| `get_account_overview` | 账号 ID | account + account_access + realmcharacters | 账号全貌：注册时间 / 邮箱 / 最后登录与 IP / 失败登录数（failed_logins）/ 客户端 OS / 招募人（recruiter）/ gmlevel / 名下角色列表 / 封禁静音状态 |
| `get_login_ip_history` | 账号 ID | account_ip + account | 账号全部历史 IP 及首末登录时间（**本地库无逐次登录流水表**，登录事件证据从 authserver stdout 导出日志中 grep） |
| `get_anticheat_record` | 角色 / 账号 | players_reports_status + daily_players_reports + acm.ai_anticheat_exemption | 服务端反作弊检测的 **DB 侧聚合**：按类型累计计数、平均延迟、按日序列；与日志解析互证（`daily_players_reports` 生产写入情况待确认，见开放问题 9）；同时输出该玩家已命中的**误报白名单标注** |
| `get_character_auras` | 角色 | character_aura（13k 行实测，移动类光环在库） | 光环清单，代码按**内置对照表**标注每条光环的移动语义（水行 / 飞行 / 加速 / 解控 / 缓降）——误报解释的直接证据。注意：为存库快照（最后一次保存状态），用于解释前一日日志足够；在线实时光环以内存为准 |

经济深挖（打金 / 金币搬运识别）：

| 工具 | 参数 | 数据源 | 用途 |
|------|------|--------|------|
| `get_money_flow` | 角色、日期范围 | log_money（含 sender_ip / topic / type） | 金币双向流水（复用现有交易查询） |
| `get_mail_transfers` | 角色 / 账号、日期范围 | mail | 收发的含金币 / COD 邮件——金币搬运主通道之一 |
| `get_auction_activity` | 角色、日期范围 | auctionhouse | 挂拍 / 成交记录与金额——拍卖行洗钱识别 |

关联团伙识别：

| 工具 | 参数 | 数据源 | 用途 |
|------|------|--------|------|
| `get_accounts_by_ip` | IP | account_ip（历史 IP 全量命中，不只 last_ip） | 同 IP 账号群及其封禁状态 |
| `get_character_associates` | 角色 | character_social + guild_member + group_member | 好友 / 公会成员 / 同队成员，附各成员反作弊聚合摘要——工作室团伙交叉识别 |

处置历史与运营概览：

| 工具 | 参数 | 数据源 | 用途 |
|------|------|--------|------|
| `get_ban_history` | 账号 ID / 角色 | account_banned + character_banned + account_muted + ip_banned | 四表合一的处置历史（账号封禁 / 角色封禁 / 静音 / IP 封禁），判断是否惯犯 |
| `get_metrics_snapshot` | 日期 | uptime + log_money + characters + account | 当日运营概览：新增 / 活跃账号、快速升级 TOP（creation_date + level 对照）、在线时长异常（totaltime）、金币流水汇总、同 IP 多账号、登录失败 TOP（failed_logins）、服务器重启与峰值在线（uptime，实测有 3415 条记录）、封禁存量（分时在线趋势首版不做） |

**反作弊核查链路（工具串联示例）**：

```
发现：anticheat 日志标记玩家 A 连续 Speed-Hack
  → parse_anticheat_violations(explain)   聚合频次 / 地图分布 / 延迟分布 + 误报解释（光环 / 易误报地图 / 白名单）
  → get_anticheat_record          DB 侧计数互证（是否持续多日）+ 已有误报标注
  → get_character_overview        角色画像：等级 / 时长 / 创建时间（练级速度异常？）
  → get_character_auras           移动类光环核对（合法加速 / 飞行 / 水行状态可否解释违规）
  → get_account_overview          账号画像：注册时间 / OS / 失败登录数
  → get_login_ip_history
  → get_accounts_by_ip            同 IP 团伙
  → get_character_associates      好友 / 公会 / 同队交叉（团伙成员各自的反作弊摘要）
  → get_money_flow + get_mail_transfers + get_auction_activity   金币去向
  → get_ban_history               处置历史（惯犯？）
  → 报告给出 suggestedAction 与完整证据链（每条证据标注来源工具与原始行；存在未排除误报信号时禁止给出 ban 建议）
```

**数据边界与勘察备注（2026-09-21 本地实测）**：

- `players_reports_status` 有真实数据（29 条）；`daily_players_reports` 本地为空——开发前在生产确认写入情况，若为空则 `get_anticheat_record` 降级为仅返回当前聚合，日志解析为唯一权威来源
- `logs` / `logs_ip_actions` 表本地为空（生产由安全模块写入）——相关工具对空表优雅降级
- `Auth.log` 仅含启动横幅，登录事件证据主要在 DB 字段（failed_logins / last_attempt_ip）与 authserver stdout（随 docker logs 每日导出，见 3.1）
- `log_money` 表在 characters 库实测存在且含 sender_ip 字段，`get_money_flow` 前置条件成立
- `character_aura` 表 13k 行实测可用，移动类光环在库（水栖形态 782、迅捷飞行形态 40120、十字军光环 32223 等已核实）——光环解释工具前置条件成立

**误报防控设计（避免误封，v2.2 新增）**：

反作弊的目标是"不漏判"，更是"**不误判**"。运营经验与本地日志均显示误报不在少数，成因是游戏机制天然触发检测：

| 违规类型 | 常见误报成因 |
|---------|-------------|
| Speed-Hack | 合法加速叠加超阈值（日志中 11-17% 的超速多为此类）：十字军光环 + 骑乘、骑乘加速物品（胡萝卜/马鞭）、靴子速度附魔、迅捷药水 |
| Walk on Water | 萨满 Water Walking、DK Path of Frost、水上行走药水；德鲁伊水栖形态在水域地图的高速移动——**水域类地图高发** |
| Fly-Hack | 德鲁伊飞行形态（33943 / 40120）在允许飞行的地图 |
| Ignore Control | 解控技能触发瞬间（人类自利 / 亡灵意志 / PvP 饰品）的位置同步延迟；**高延迟（>100ms）位置回滚**——**部分地图 / 卡顿场景高发** |
| Teleport To Plane | 缓降类（法师缓降、工程披风）、悬崖地形、地图边界；IgNore Control 同源的网络抖动 |

防控四层机制（判定规则代码内置，延续"AI 出意图，代码出判断"，AI 只消费结论）：

1. **移动类光环对照表**（代码内置初稿，开发时按 spell ID 校准）：按违规类型归组的光环 / 技能清单，命中即作为该违规类型的候选解释——`get_character_auras` 与解析器 explain 模式共用此表
2. **易误报地图 / 区域配置**：可配置清单（初始由 Owner 依运营经验提供，见开放问题 10），解析器按日志中坐标 / 地图 ID 打标，直接回答"是否又是那张地图"
3. **延迟降权**：标记时延迟超阈值（默认 100ms）的记录降权，避免网络抖动型误判
4. **误报白名单**：acm 库 `ai_anticheat_exemption` 表（角色 × 违规类型 × 地图，含原因与标注人），GM 在报告页"标记为误报"后写入，后续同类告警自动降权——**误报判定经验随使用沉淀**

**降级原则（硬性）**：可疑玩家存在任一未排除的误报信号 → `suggestedAction` **不得为 ban**，一律降为 investigate / warning；报告中以 `falsePositiveSignals` 字段列出全部信号，供 GM 终审。

**工具硬约束（代码层强制，不依赖 prompt）**：

- SQL 语句固定在代码中，仅参数经校验后绑定（参数化查询，防注入）
- 单工具返回行数上限（默认 50）、SQL 超时（默认 5s）
- 单次任务（巡检 / 单轮对话链）总调用次数预算（默认 20 次，可配置；上述核查链路完整走一遍约 11 次，预算内可完成），超预算后工具不可用
- 结构化解析工具（`parse_anticheat_violations`）同样计入预算，仅返回聚合结果 + 摘录证据行，不返回原始日志全文
- 每次调用（工具名 + 参数 + 耗时 + 返回行数）写入 acm 库审计表，AI 的查询行为可完整回放

**系统库边界（新增）**：

- 新建 **`acm` 库（PostgreSQL 独立实例，compose 服务 `acm-postgres`）**，为 ACM 自有的**可写**库：ai_report、会话 / 消息、模型配置、Token 用量、工具审计、ai_anticheat_exemption（误报白名单）及 LangGraph checkpoint 等表；生产使用腾讯云托管 PostgreSQL
- AzerothCore 三库（auth / characters / world）保持**只读**不变；agent 不持有任何数据库连接，acm 库写入一律由 ACM 后端代码完成

**目标库与降级**：agent 在线查询复用 ACM 现有主库连接，靠超时 / 行数上限 / 调用预算控制对线上查询的影响；预留只读从库切换能力（环境变量指定专用数据源），运维确认从库可用后切换即可

**防线清单（纵深防御）**：

1. DB 账号仅 SELECT 权限——账号层硬兜底，即使以上防线全部失守也不可能写游戏库
2. 工具白名单 + 参数化查询——AI 无法构造任意 SQL
3. 超时 + 行数上限 + 调用预算——无法拖垮数据库
4. 查询全量审计——行为可追溯
5. 日志内容视为不可信输入——玩家聊天 / 角色名可能含提示注入内容，靠工具白名单兜底而非 prompt 自觉；报告中引用的每条数据库证据均须来自白名单查询结果

### 3.6 LLM 模型配置与 Token 计量（新增）

**需求描述**：模型出口不写死在代码 / 环境变量中，由 Owner 在后台管理界面配置，并完整记录 Token 消耗。

**具体功能**：

- **后台配置**（gmlevel = 4）：配置模型出口——协议（OpenAI 兼容）、base_url、model、api_key、温度、max tokens；密钥加密存储，界面不明文回显
- **生效机制**：配置变更 → agent 出口指纹变化 → 实例自动重建（见 3.3），无需重启
- **Token 计量**：每次 LLM 调用（对话 / 巡检）记录 prompt / completion / total tokens 与耗时，维度：日期、场景（chat / inspection）、模型、会话或任务 ID，写入 `ai_token_usage` 表
- **用量看板与预算告警**：后台按日查看消耗趋势；日预算阈值（默认可配）超限时飞书告警（仅告警不自动停用，熔断策略留下轮迭代）

### 3.7 前端（AI 诊断报告页 + AI 助手对话页）

**需求描述**：新增"AI 诊断"feature（`frontend/src/features/ai-diagnosis/`）与"AI 助手"feature（`frontend/src/features/ai-assistant/`），移动端适配。

**报告列表**：日期、健康评分、异常事件数、可疑玩家数，默认按日期倒序；行操作含删除与处置备注入口（见 3.11）。

**报告详情**：

- 顶部：健康评分、总结摘要、生成时间
- Tab / 分区：服务器健康、可疑玩家、处置建议
- **可疑玩家表**：角色、账号、严重级别、原因、证据片段（可展开）、AI 建议动作、已警告标注；提供"跳转角色 / 账号详情"入口，衔接现有角色管理页人工核查；支持多选后一键发送警告邮件（见 3.10）
- **原始 Markdown 查看与一键复制（新增）**：
  - 详情页提供 Markdown 源文视图
  - **"复制 Markdown"按钮**：一键复制报告全文（与落库 / 归档的 .md 完全一致）到剪贴板，GM 直接粘贴到论坛（Discourse 等主流论坛原生渲染 Markdown）
  - 首版为原文复制，不做 BBCode 转换与自动脱敏；报告含玩家 IP、账号等敏感信息，公开渠道发布前由 GM 自行评估（见开放问题 7）

**AI 助手对话页**：

- 会话列表 / 新建 / 历史消息（正本在 acm 库）
- SSE 流式输出；工具调用过程可选展示（如"正在查询金币流水…"）

**定向分析页**：

- 表单：昵称 / 账号 + 时间范围；账号 / 角色详情页提供"发起 AI 分析"入口（预填对象）
- SSE 进度展示（工具调用过程）；结果页：结构化结论 + 分析建议徽标 + **一键复制 Markdown**（复用报告复制组件）
- 历史分析列表可回看（同一对象多轮申诉分析追加保存），支持处置备注、Markdown 润色与删除（见 3.11）

**上传状态**：展示最近 7 天日志上传完整性。

**权限**：

- 查看报告、AI 助手对话：gmlevel ≥ 2
- 手动 / 对话触发巡检、模型配置管理、报告修改与删除（见 3.11）：gmlevel = 4

**处置原则**：**AI 只诊断、不自动处置；渐进式处置——警告优先于封禁；防误封优先于防漏判**。AI 在报告中给出建议动作分级（提醒邮件 / 人工核查 / 封禁），GM 人工确认后执行；首犯与轻度违规优先发送提醒邮件（见 3.10），屡犯或情节严重再封禁。**封禁建议门槛**：仅当可疑玩家**无未排除的误报信号**（解释性光环 / 易误报地图 / 高延迟 / 误报白名单命中，见 3.5 误报防控）且满足"多类型违规 + 跨多日持续 + 非初犯"时，AI 才可给出 ban 建议，否则一律降级为 investigate / warning。报告页提供"**标记为误报**"入口：GM 确认误报后写入误报白名单，后续同类告警自动降权。封禁等操作由 GM 通过现有功能执行（与"游戏库只读 + SOAP 变更"的项目约束一致）。

### 3.8 定向分析（账号申诉分析，新增）

**需求描述**：玩家被封禁后常在论坛发帖申诉，GM 需要快速给出有依据的回复。提供**指定账号 / 角色的定向分析**能力：GM 提供玩家昵称（或账号）与时间范围，Agent 对该对象在指定时段的行为做定向取证分析，输出结构化分析结论并落库；结论以 Markdown 呈现，支持一键复制粘贴到论坛回帖。

**具体功能**：

- **输入**：玩家昵称或账号 ID（必填）+ 时间范围（默认封禁日前 7 天至当天，可修改）
- **分析内容（Agent 自动编排，复用 3.5 反作弊核查链路工具，无需新增工具）**：
  - 封禁背景：`get_ban_history`（封禁原因 / 执行人 / 是否惯犯）、`get_account_overview`（注册 / OS / 失败登录）
  - 时段内违规：`parse_anticheat_violations`（按昵称 / GUID + 日期范围过滤）、`get_anticheat_record`（历史聚合）
  - 行为画像：`get_character_overview`、`get_character_auras`（误报解释）、`get_login_ip_history` + `get_accounts_by_ip`（登录 IP 与多开）
  - 经济与团伙（按需）：`get_money_flow` / `get_mail_transfers` / `get_auction_activity` / `get_character_associates`
  - **误报核查**：explain 引擎结论计入分析（存在未排除误报信号时明确提示，避免维持误封）
- **输出**：
  - 结构化结论（JSON）：分析对象 / 时间范围 / 违规确认情况 / 误报信号 / 证据链（每条注明来源工具与原始行）/ **分析建议**（维持封禁 maintain / 解除封禁 lift / 降级处理 downgrade / 建议人工复核 manual_review）
  - Markdown 全文：面向论坛的正式回复文本（结论 + 关键证据摘要），一键复制（复用 3.7 复制 Markdown 能力；公开发布脱敏由 GM 自行评估，见开放问题 7）
  - **误报硬约束**：存在未排除误报信号时，分析建议不得为 maintain，降级为 manual_review 及以下
- **落库**：acm 库 `ai_targeted_analysis` 表——同一对象可多轮申诉分析，记录**追加不覆盖**，形成分析历史；含状态（running / ok / failed）、Token 消耗、发起人；记录的修改 / 删除见 3.11
- **入口**：
  - AI 助手页"定向分析"表单（昵称 + 时间范围）
  - 账号 / 角色详情页"发起 AI 分析"按钮（预填对象与建议时间范围）
- **执行方式**：与对话一致的 SSE 流式执行（实时展示工具调用进度），完成后落库并跳转结果页；工具调用预算与巡检同规
- **权限与边界**：发起 gmlevel ≥ 2；分析只读，不改变封禁状态——解除 / 维持封禁仍由 GM 通过现有封禁功能执行

### 3.9 飞书推送

**需求描述**：分析完成后通过飞书机器人推送日报，GM 在手机上直接掌握服务器状态。

**具体功能**：

- 每日推送报告摘要卡片：日期、健康评分、异常事件数、可疑玩家数、TOP 1-3 风险点、报告页链接
- 告警类推送（独立于日报）：分析失败告警、日志断传告警、Token 日预算超限告警
- "异常即时告警"（高危违规实时推送）本轮不做，留下轮迭代
- Webhook 地址与签名密钥通过环境变量配置，未配置时静默跳过

### 3.10 违规提醒邮件（GM 工具 + 巡检联动）

**需求描述**：巡检发现问题后，直接封号并非最佳处置——对首犯、轻度违规玩家应先警告给予整改机会，屡犯或情节严重再升级封禁。因此提供便捷的**游戏内提醒邮件**发送能力，支持单人或批量，并与 AI 诊断报告联动。

**具体功能**：

- **GM 工具独立入口**：新增"发送邮件"工具，按角色名发送（支持批量输入角色名列表），可选择模板或自由编辑标题 / 正文
- **诊断报告联动**：
  - 报告页可疑玩家表支持**多选 → 一键发送警告邮件**
  - 确认框自动载入警告模板并填充变量（角色名、违规类型、报告日期），GM 可编辑后二次确认发送
  - 已发送过警告的玩家在报告中标注"已警告"（基于审计记录），避免重复警告
- **默认警告模板**：告知玩家系统检测到异常行为、要求立即停止、说明再犯将导致封禁；语气正式克制；支持变量占位符（`{player}`、`{reason}`、`{date}`），模板文案可配置
- **AI 建议动作分级**：报告可疑玩家带 `suggestedAction`（warning / investigate / ban），GM 参考决定处置方式
- **发送通道**：遵循项目约束，通过 SOAP 向 worldserver 发送 `.send mail` 命令完成落库，**ACM 不直接写 `mail` 表**
- **发送结果**：逐目标反馈成功 / 失败（角色不存在、命令失败等），失败可单独重试；批量中单个失败不影响其他目标
- **安全要求**：
  - 权限 gmlevel ≥ 2；发送属敏感操作，需二次确认
  - 全量审计：操作人、目标角色、模板来源、标题正文、发送结果、关联报告 ID
  - **正文长度上限 500 字**（前后端双重校验，超限拦截）

### 3.11 报告管理（增删改查，新增）

**需求描述**：每日巡检报告（`ai_report`）与定向分析结论（`ai_targeted_analysis`）是 GM 的日常工作材料，提供基础的**增删改查**管理能力，支撑"查看 → 标注处置 → 清理过期记录"的完整使用闭环。

**具体功能**：

- **查（已有能力，纳入统一管理）**：
  - 每日报告：列表 / 详情 / Markdown（见 3.7）
  - 定向分析：历史列表 / 结论详情（见 3.8）
- **增（已有能力，纳入统一管理）**：
  - 每日报告：手动 / 对话触发巡检生成，重跑同日覆盖（见 3.4）
  - 定向分析：发起分析即新增记录，多轮申诉**追加不覆盖**（见 3.8）
- **改**：
  - **GM 处置备注（`gm_remark`）**：两类报告均可附加处置说明（每日报告如"已发警告 / 已封禁"；定向分析如"已回帖 / 已解封 / 已驳回"），随报告展示
  - **定向分析 Markdown 润色**：结果页可编辑 `conclusion_markdown` 后再复制回帖（申诉回复常需按语气调整）；编辑留痕（`updated_at`），结构化结论 `conclusion_json` 保持 AI 原始输出**不可改**
  - **每日报告 AI 内容不可编辑**：保持证据完整性，仅允许附加备注
- **删**：
  - 单条删除，**二次确认**（输入确认文字，遵循项目危险操作规范）
  - 每日报告删除后 Redis 摘要同步失效；**COS 归档保留**（不可变备份，事后可追）
  - 定向分析删除仅移除 acm 库记录
- **权限与审计**：
  - 查 / 增沿袭现状（见 3.7 权限）；**改 / 删 = gmlevel = 4**（报告属取证材料，管理操作仅 Owner）
  - 全部修改 / 删除操作经审计中间件落 GM 操作日志：操作人、对象、变更摘要、时间

## 4. 非功能需求

- **安全**：COS 桶私有读写；ACM 使用只读凭证读日志、读写凭证写报告（分离）；报告页与对话页受 JWT + GM 等级守卫保护；日志与报告不对外暴露；LLM api_key 加密存储；AI 巡检与对话遵循 3.5 隔离设计（游戏库账号仅 SELECT、白名单工具、调用全量审计）
- **成本**：日志 tar.gz 压缩上传；COS 生命周期规则自动清理——原始日志保留 **90 天**（已确认），AI 报告保留 1 年（均可配置）；LLM Token 日预算告警
- **可靠性**：上传失败重试、巡检失败重试，均落地为飞书告警而非静默失败；报告按 realm+日期幂等 upsert；单日分析失败不影响历史报告；checkpoint 与对话正本同落 acm PG 库，持久化由数据库保障
- **性能**：全 agentic 分析受工具行数上限与调用预算约束；Job 函数的时长 / 内存 / 临时磁盘上限开发前实测（见开放问题 3）
- **可扩展**：目录与数据结构按 realm 隔离，为多 realm 预留；报告 schema 版本化（`schemaVersion` 字段）；agent 工具集采用统一注册机制，便于后续扩展新工具

## 5. 技术方案要点

- **游戏服侧**：Shell 脚本 + 腾讯云 COSCLI（coscli），系统 crontab 调度；Appender 配置改造（a 模式 + 时间戳 flags）+ copytruncate 轮转；崩溃数据经 docker CLI 按天导出；脚本与配置模板纳入仓库 `ops/` 目录（凭证不入库）
- **Agent 运行时（Node.js，与 ACM 后端同栈）**：
  - `deepagents`（JS 版，npm 包 `deepagents`）+ 按配置协议分派模型客户端：`openai` 协议 → `@langchain/openai`（ChatOpenAI），`anthropic` 协议 → `@langchain/anthropic`（ChatAnthropic 指向兼容 baseURL）；模型 / 温度 / max tokens 来自后台配置（3.6）
  - agent 实例按模型出口指纹 LRU 缓存 + 闲置淘汰（参考 ai-invest-assisstant 模式）
  - checkpointer：`@langchain/langgraph-checkpoint-postgres`（acm PG 库；原 RedisSaver 方案因硬依赖 RedisJSON / RediSearch 模块弃用，见 3.3 持久化决策）；对话正本落 acm 库
  - 系统提示词 YAML 管理；skills 目录提供 grep-first 日志检索方法论，对 agent 只读（FilesystemPermission 禁写）
- **SCF 部署形态**：
  - Web 函数：承载 ACM 单体（API + 静态资源）+ deepagents 对话运行时（SSE）
  - Job 函数：定时触发器（每日 06:00）拉起，与 Web 函数共用同一份 agent 代码包执行巡检；进程内不跑定时任务
- **acm 库（PostgreSQL）新增表**：`ai_model_config`（模型出口配置）、`ai_token_usage`（Token 计量）、`ai_chat_session` / `ai_chat_message`（对话正本）、`ai_tool_audit`（工具调用审计）、`ai_report`（诊断报告，含 Markdown 全文）、`ai_targeted_analysis`（定向分析结论，含 Markdown 全文，追加式）；另含 PostgresSaver 自管的 checkpoint 表（checkpoints / checkpoint_blobs / checkpoint_writes）
- **前端**：`@assistant-ui/react` + `@assistant-ui/react-langgraph`（React 18 兼容）构建对话页；报告页"复制 Markdown"基于剪贴板 API 写入原始 .md 全文
- **违规提醒邮件**：扩展 `gm-tool` 路由与服务，基于现有 `soap.service.ts` 实现 `.send mail` 封装；注意命令中中文与换行的转义；警告模板存于配置文件（不入库）
- **新增依赖**：
  - 后端：`deepagents`、`@langchain/openai`、`@langchain/anthropic`、`@langchain/langgraph`、`@langchain/langgraph-checkpoint-postgres`、`pg`、`cos-nodejs-sdk-v5`（ioredis 已有，用于缓存）
  - 前端：`@assistant-ui/react`、`@assistant-ui/react-langgraph`、`@assistant-ui/react-markdown`
- **新增后端模块**：
  - `services/ai-agent/`（运行时组装、工具注册、skills 加载、指纹 LRU 缓存）
  - `services/ai-inspection.service.ts`（巡检编排）、`services/ai-targeted-analysis.service.ts`（定向分析编排）、`services/cos.service.ts`（COS 读写）、`services/llm-config.service.ts`、`services/token-usage.service.ts`
  - `routes/ai-assistant.routes.ts`（SSE 对话）、`routes/ai-diagnosis.routes.ts`（报告查询与管理：备注 / 删除）、`routes/ai-analysis.routes.ts`（定向分析 SSE 与记录管理）、`routes/ai-model-config.routes.ts`
  - `repositories/` 层扩展只读查询，实现快照指标与白名单钻取工具，与现有查询同一套只读封装
- **新增环境变量（节选）**：`COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION`、`ACM_SYSTEM_DB`（默认 acm）、`FEISHU_WEBHOOK`、`AI_TOOL_CALL_BUDGET`、`AI_TOKEN_DAILY_BUDGET`、`LLM_AES_KEY`（仅用于 api_key 加解密）；LLM 出口配置全量存于后台 `ai_model_config`，**无环境变量兜底**——首启由管理员在后台新增模型配置并设默认，未配置时明确报错（M0 已按此语义验证，见 `backend/poc/agent/resolve-config.ts`）

## 6. 里程碑与验收标准

| 里程碑 | 内容 | 验收标准 |
|-------|------|---------|
| M1 日志上传 | 游戏服 Appender 配置改造（a 模式 + 时间戳）+ 上传脚本（copytruncate / docker logs 导出 / manifest）+ COS 目录规范 + 断传监控 | 连续 3 天日志按时到齐且 md5 校验通过；重启 worldserver 后 Server.log 历史保留且新条目带时间戳；人为删除 manifest 触发断传告警 |
| M2 Agent 底座 | acm 库建模 + LLM 后台配置与 Token 计量 + deepagents 运行时（SSE 对话、PG checkpointer、白名单工具、全量审计）+ 前端对话页 | gmlevel ≥ 2 可对话、< 2 拒绝；修改模型配置后无需重启即生效；对话消息与工具调用全量落库可回放；DB 账号权限核查仅 SELECT |
| M3 每日巡检 | Job 函数定时触发 + 全 agentic 日志分析 + 报告落库（PG / COS / Redis 缓存）+ 飞书推送 + 手动与对话触发重跑 | 对人工植入已知违规样例的日志能检出对应可疑玩家并附证据；**人工植入"十字军光环 + 骑乘超速"类合法加速样例时，报告正确标注误报信号且不给出 ban 建议**；同日重跑幂等覆盖不产生重复报告；Token 用量记录与预算告警生效；分析失败能告警；可疑玩家的证据链工具调用序列可由审计日志完整回放 |
| M4 报告与处置 | 诊断报告页（含一键复制 Markdown）+ 定向分析（申诉分析）+ 提醒邮件 + 报告页批量联动 + 报告管理（增删改查，见 3.11） | 移动端可查看报告；gmlevel < 2 无法访问；复制内容粘贴至 Markdown 论坛正常渲染；提供昵称 + 时间范围可发起定向分析，结论落库且可复制回帖，存在误报信号时建议不为维持封禁；单发与批量邮件经 worldserver 成功送达游戏内邮箱；失败目标可识别并重试；"已警告"标注与全程审计记录；报告与定向分析可改备注 / 润色 Markdown / 删除（gmlevel=3、二次确认、审计可查） |

## 7. 开放问题

1. **反作弊日志轮转交接**：按天归档当前由生产环境 cron 完成，建议 M1 上传脚本（copytruncate）统一接管后下线旧 cron；需与运维确认交接时间点，避免与 05:00 上传产生竞争。
2. ~~SCF Web 函数 SSE 兼容性~~ **已决策（2026-09-21）：支持**。腾讯云 SCF Web 函数对 SSE 的兼容性已在 squadsight 项目实测验证，M2 的 SSE 对话无需降级预案（保留非流式整段返回作为异常兜底）。
3. **Job 函数资源上限**：时长 / 内存 / 临时磁盘上限需 M3 前实测（全 agentic 分析含日志下载解压）；若超限，按日志类型拆分为多次 Job 调用。**M0 进展（2026-09-21）**：Job 专用镜像 `docker/Dockerfile.job` 与验证桩 `src/job/inspection-job.ts`（fixture 下载→/tmp 解压→扫描→耗时内存 JSON）已就绪，本地基线：合成 fixture（20 文件 300KB）总耗时 66ms / RSS 41MB；SCF 实测待回填 /tmp 上限、子进程与出站网络结论（`docs/plan/M0-SCF部署指引.md`）。
4. ~~Redis AOF / checkpoint 存储~~ **已决策（2026-09-22，T0.3 终局）：checkpoint 存 acm PostgreSQL，Redis 不承载会话**。T0.3 实测 `@langchain/langgraph-checkpoint-redis` 硬依赖 RedisJSON（`JSON.SET`）与 RediSearch（`FT.CREATE`）模块——本地 redis:7-alpine 无模块直接不可用，生产与 ranking 共享的腾讯云 Redis 亦不满足。决策：acm 自有库定为 PostgreSQL，checkpointer 采用官方 `@langchain/langgraph-checkpoint-postgres`（PostgresSaver，无模块依赖），checkpoint 与对话正本同库；Redis 回归纯缓存角色（ranking 共享实例维持现状）。PG checkpoint 无自动 TTL，会话清理由后端定期 `deleteThread` 实现（M2）。
5. **`.send mail` 离线角色**：是否支持离线角色需开发前实测；若仅支持在线角色，发送时标注目标在线状态，离线目标保留在待发清单由 GM 稍后处理（不引入常驻发送队列）。
6. **警告邮件默认文案**：需 Owner 评审定稿后上线。
7. **报告公开粘贴脱敏**：首版"复制 Markdown"为原文复制（含玩家 IP / 账号），GM 公开发布前自行评估；是否需要"复制为公开版"（自动剥离敏感字段）留下轮迭代。
8. **多 realm 编排**：realm3 单 realm 上线，多 realm 的并行任务隔离待后续评估。
9. **`daily_players_reports` 生产写入确认**：本地测试库该表为空（`players_reports_status` 有数据）；开发前在生产确认有写入，否则反作弊 DB 聚合工具降级、日志解析为唯一权威来源。**M0 进展（2026-09-21）**：确认 SQL 已备妥（见 `docs/plan/M0-Spike结论.md` T0.4 节，只读查询），待授权在生产 characters 库执行后回填。
10. **易误报地图 / 区域初始清单**：依运营经验（部分地图高频触发 Walk on Water / Ignore Control），需 Owner 整理已知高误报地图 / 区域列表，作为 3.5 误报防控第 2 层配置的初始值。
