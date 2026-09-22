# AI 诊断与 Agent 开发计划

> 版本：v1.2（2026-09-21）
> 对应需求：[requirements/01-log-upload-ai-diagnosis-requirement.md](../requirements/01-log-upload-ai-diagnosis-requirement.md)（v2.4）
> 对应架构：[arch/06AI诊断与Agent架构.md](../arch/06AI诊断与Agent架构.md)
> 估算口径：单人开发人日（含自测，不含评审等待）

## 一、总体节奏

```
周次      W1          W2          W3          W4          W5
        ┌─────┐
M0 前置  │Spike│
M1 日志  │────×│(轨道A, 可与M2并行)
M2 底座      │────────────────×│
M3 巡检                      │──────────×│
M4 处置                                  │──────────×│
```

| 里程碑 | 内容 | 预估 | 退出标准（需求验收） |
|-------|------|------|-------------------|
| M0 前置验证 | 4 项 Spike + 数据确认 | 2-3 天 | 见 2.1，结论回写需求开放问题 |
| M1 日志上传 | Appender 改造 + 上传脚本 + 断传告警 | 2-3 天 | 连续 3 天到齐且 md5 通过；重启不丢日志；删 manifest 触发告警 |
| M2 Agent 底座 | acm 库 + 模型配置 + 对话 + 工具层 | 6-8 天 | 对话可用且权限正确；配置热生效；审计可回放；DB 仅 SELECT |
| M3 每日巡检 | Job 编排 + 全 agentic 分析 + 落库推送 | 4-5 天 | 植入样例可检出；误报样例不建议 ban；幂等重跑；Token 告警生效 |
| M4 报告与处置 | 前端报告页 + 复制 Markdown + 提醒邮件 + 账号申诉定向分析 + 报告管理（增删改查） | 7-8 天 | 论坛粘贴渲染正常；邮件送达；误报标注闭环；定向分析结论落库且误报信号时建议非"维持封禁"；报告备注 / Markdown 润色 / 删除可审计；全程审计 |

合计约 **21-27 人日**（全职约 5 周）。

---

## 二、任务分解

### 2.1 M0 前置验证（Spike，2-3 天）

结论直接决定 M2/M3 的实现方案，**必须最先做**；每项结论回写需求文档开放问题。

| 编号 | 任务 | 产出 | 预估 |
|------|------|------|------|
| T0.1 | SCF Web 函数 SSE 验证：squadsight 项目已实测支持，无需再部署端点 | 支持结论（已达成）；保留非流式整段返回作异常兜底 | 0 天（已完成） |
| T0.2 | SCF Job 函数实测：Job 专用镜像（Dockerfile.job）部署、内存/时长/tmp 上限，模拟日志下载+解压（`src/job/inspection-job.ts`） | 资源配额结论；超时则确定按日志类型拆分策略 | 0.5 天 |
| T0.3 | deepagents JS PoC（本地）：`createDeepAgent` + 按协议分派模型客户端（openai→ChatOpenAI / anthropic→ChatAnthropic）+ checkpointer 多轮对话跑通。**结论（2026-09-22）**：全链路已跑通；RedisSaver 硬依赖 RedisJSON/RediSearch 模块不可用 → acm 库改 PostgreSQL + PostgresSaver（无 TTL，改 deleteThread 清理） | 可运行 PoC 代码（`backend/poc/agent/`）；checkpointer 选型结论 | 1 天 |
| T0.4 | 生产数据确认：`daily_players_reports` 是否写入；`.send mail` 离线角色支持 | 两项结论，影响 T2.5 工具降级与 T4.4 方案 | 0.5 天 |
| T0.5 | Owner 侧材料：易误报地图/区域清单、光环与解控技能 spell ID 校准（可与 M2 并行收集） | `aura-rules.ts` 与地图配置的定稿输入 | 0.5 天 |

### 2.2 M1 日志上传（2-3 天，游戏服侧为主，可与 M2 并行）

| 编号 | 任务 | 产出 | 依赖 | 预估 |
|------|------|------|------|------|
| T1.1 | Appender 配置改造：worldserver(Server/Errors/GM) + authserver(Auth) 改 `a` 模式 + flags 39（时间戳） | 更新后的 `configs/*.conf` + 本地验证记录（重启后历史保留、新行带时间戳） | 无 | 0.5 天 |
| T1.2 | 上传脚本 `ops/upload-logs.sh`：打包 tar.gz、copytruncate 轮转、`docker logs --since` 崩溃导出、manifest.json（md5/行数）、失败退避重试≥3 | 脚本 + 配置模板（凭证不入库） | T1.1 | 1 天 |
| T1.3 | coscli 接入：CAM 子账号（仅 `acore-logs/*` 写权限）、`~/.coscli` 凭证、COS 桶私有读写 + 90 天/报告 1 年生命周期规则 | 可用上传通道 | 无 | 0.5 天 |
| T1.4 | 生产 cron 交接：部署上传任务，下线旧 anticheat 轮转 cron，确认与 05:00 无竞争 | 生产就绪 | T1.2, T1.3 | 0.5 天 |
| T1.5 | 断传检查最小版：独立脚本/端点检查前一日 manifest 完整性 → 飞书告警（M3 归并进 Job 前置步骤） | 断传告警可用 | T1.3 | 0.5 天 |

### 2.3 M2 Agent 底座（6-8 天，核心）

| 编号 | 任务 | 产出 | 依赖 | 预估 |
|------|------|------|------|------|
| T2.1 | acm 库接入：第 4 个 TypeORM 数据源（**PostgreSQL**，T0.3 结论）+ 8 张表实体（arch 4.1-4.7）与建表迁移（`ai_model_config` 已于 M0 落表） | entities/acm + 迁移脚本 | T0.3 | 1 天 |
| T2.2 | llm-config.service：api_key AES 加密存取、出口指纹、model-config 路由（gmlevel=3，界面不回显；配置内容与 UI 交互参考 ai-invest-assisstant：provider 预设自动填充、api_key 留空不改、Modal 内测试连接、设默认/删除行操作） | 配置管理 API | T2.1 | 1 天 |
| T2.3 | token-usage.service：调用计量落库、按日聚合报表 API、日预算飞书告警 | 计量与告警 | T2.1 | 0.5 天 |
| T2.4 | agent runtime：agent-factory（指纹 LRU + 闲置淘汰）、checkpointer 单例、budget-guard | `agent/runtime/` | T0.3, T2.2 | 1 天 |
| T2.5 | DB 白名单工具 10 个：repository 只读查询（SQL 写死 + 参数化 + 行数/超时护栏）、zod schema、审计包装、单测（含空表降级） | `agent/tools/db-tools/` + 测试 | T2.1 | 1.5 天 |
| T2.6 | 日志工具 3 个：cos.service、get_log_manifest、fetch_log_archive（/tmp 工作区 + 清理）、parse_anticheat_violations（正则 + 聚合 + explain 挂点） | `agent/tools/log-tools/` | T2.1 | 1 天 |
| T2.7 | 误报引擎：aura-rules.ts（T0.5 输入定稿）、explain 解释器、ai_anticheat_exemption.service 与标注 API | `agent/false-positive/` | T0.5, T2.6 | 1 天 |
| T2.8 | assistant 路由：SSE 流式 + 事件协议（arch 5.2）+ 非流式降级、会话管理（PG 正本 + deleteThread 清理 checkpoint） | `routes/ai-assistant.routes.ts` | T2.4 | 1 天 |
| T2.9 | 前端 ai-assistant：assistant-ui 集成、SSE runtime 适配、会话列表/历史、工具调用过程展示 | `features/ai-assistant/` | T2.8 | 1-1.5 天 |

**M2 自测剧本**：gmlevel≥2 可对话、<2 拒绝；后台改模型 → 不重启生效；连续多轮对话上下文正确；`ai_tool_audit` 可完整回放一次工具调用链；DB 账号权限核查仅 SELECT。

### 2.4 M3 每日巡检（4-5 天）

| 编号 | 任务 | 产出 | 依赖 | 预估 |
|------|------|------|------|------|
| T3.1 | inspection.service 编排：断传检查归并（替代 T1.5）、预算管理、JSON schema 校验（非法追问修复一轮）、ai_report 幂等 upsert、COS 归档、Redis 摘要、失败退避重试 + 告警 | 巡检核心编排 | T2.4-T2.7 | 1.5 天 |
| T3.2 | 巡检提示词与 skills：inspection.yaml 系统提示词 + grep-first 检索方法论 skills（只读目录） | prompts + skills | T3.1 | 1 天 |
| T3.3 | Job 函数形态：Job 专用镜像（`docker/Dockerfile.job`，与 Web 单体镜像分开构建）、inspection-job.ts 一次性执行、SCF 定时触发器（06:00）与资源配置 | 可定时运行的 Job | T0.2, T3.1 | 1 天 |
| T3.4 | 手动/对话触发：trigger 路由（gmlevel=3）+ inspection-tools（对话内触发） | 双触发入口 | T3.1 | 0.5 天 |
| T3.5 | 飞书日报卡片：评分/异常数/可疑数/TOP 风险/报告链接 | 推送可用 | T3.1 | 0.5 天 |
| T3.6 | 植入样例联调：构造含已知违规日志 + "十字军光环+骑乘"合法加速样例，验证检出与误报拦截；Token 用量与预算告警验证 | 联调记录 | T3.1, T2.7 | 0.5-1 天 |

**M3 自测剧本**：对植入样例能检出可疑玩家并附证据；误报样例 `falsePositiveSignals` 非空且建议≠ban；同日重跑覆盖不重复；审计可回放工具调用序列；分析失败触发飞书告警。

### 2.5 M4 报告呈现与处置（7-8 天）

| 编号 | 任务 | 产出 | 依赖 | 预估 |
|------|------|------|------|------|
| T4.0 | 定向分析后端：analysis.yaml 提示词 + targeted-analysis.service（复用巡检管线与白名单工具）+ SSE 路由（同 5.2 协议）+ ai_targeted_analysis 落库（追加不覆盖）+ 结论 schema 校验（falsePositiveSignals 非空强制 manual_review） | `agent/` 扩展 + `ai-analysis.routes.ts` | T2.4-T2.8, T3.1 | 1.5 天 |
| T4.1 | ai-diagnosis 前端：报告列表/详情（Tab：健康/可疑玩家/建议）、上传状态（近 7 天） | `features/ai-diagnosis/` 主体 | M3 | 1.5 天 |
| T4.2 | Markdown 视图 + 一键复制：raw 接口、clipboard 写入与降级、论坛粘贴验证（Discourse 实测） | 复制功能 | T4.1 | 0.5 天 |
| T4.3 | 可疑玩家表增强：误报徽标（falsePositiveSignals）、角色/账号跳转、多选批量、标记误报弹窗（写白名单闭环） | 处置交互 | T4.1 | 1 天 |
| T4.4 | 违规提醒邮件：gm-tool 扩展 `.send mail`（中文/换行转义）、模板变量、批量逐目标反馈、500 字前后端校验、二次确认、全量审计 | GM 邮件工具 | T0.4 | 1 天 |
| T4.5 | 报告联动：多选一键警告（模板自动填充）、"已警告"标注（查审计记录） | 诊断→处置闭环 | T4.3, T4.4 | 0.5 天 |
| T4.6 | 定向分析前端：发起表单（昵称/账号 + 时间范围）、SSE 过程展示、结论页与复制 Markdown、历史列表、账号/角色详情页"发起 AI 分析"入口 | `features/ai-diagnosis/` 定向分析页 | T4.0, T4.2 | 1 天 |
| T4.7 | 报告管理（增删改查）：PUT/DELETE 路由（每日报告 + 定向分析记录）、两表增 `gm_remark`/`updated_at` 字段、前端处置备注编辑 / Markdown 润色保存 / 二次确认删除（输入确认文字）、写操作全量审计落 GM 操作日志 | 管理接口 + `ReportManageActions` 组件 | T4.1, T4.6 | 1 天 |

---

## 三、依赖与并行轨道

```
轨道A(游戏服/运维)              轨道B(后端)                      轨道C(前端)
T0.1/T0.2 Spike ──┐
T1.1→T1.2→T1.3→T1.4  ──┐    T0.3 PoC ─→ T2.1→T2.2→T2.4 ─┐
                       │                T2.3 ──────────┤→ T2.8 → T2.9(前端)
                       └─ M1 验收       T2.5/T2.6/T2.7 ┘
                                        T3.1→T3.2→T3.3→T3.5→T3.6
                                            └→ T4.0→T4.1→T4.2→T4.3→T4.4→T4.5→T4.6→T4.7
T0.4/T0.5（Owner 材料）随时并行收集，T2.7/T4.4 前到位即可
```

- M1 与 M2 完全并行；M2.9（前端对话）可在 T2.8 后立即启动
- T0 结论是硬前置：T0.1 决定 T2.8 是否要实现降级分支；T0.2 决定 T3.3 是否拆分 Job

## 四、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| SCF Job 时长不足（全 agentic 分析超限） | M3 方案重做 | T0.2 提前实测；预案：按日志类型拆多次 Job 或缩小分析窗口 |
| deepagents JS 能力与预期不符 | M2 返工 | T0.3 本地 PoC 前置；备选：@langchain/langgraph 原生 agent + 自建 todo |
| GLM 输出 JSON 不稳定 | 报告生成失败率高 | schema 校验 + 追问修复轮；温度调低；few-shot 示例进提示词 |
| 全 agentic 读日志 Token 成本超预期 | 成本失控 | grep-first skills 硬约束 + 预算器 + 日预算告警（M2 即上线） |
| 误报规则误杀/漏放 | 误封或漏判 | 初版仅"标注信号"不自动处置；GM 白名单闭环持续校准 |
| 生产 Appender 改造影响运行服 | 游戏服重启异常 | 先本地验证重启行为，生产变更安排在低峰并保留回滚配置 |

## 五、里程碑验收清单（汇总自需求第六章）

- [ ] M1：连续 3 天日志到齐且 md5 通过；worldserver 重启后 Server.log 历史保留且带时间戳；删 manifest 触发断传告警
- [ ] M2：gmlevel 权限正确；模型配置热生效；对话与工具调用全量落库可回放；DB 账号仅 SELECT
- [ ] M3：植入违规样例可检出并附证据；合法加速样例标注误报且不建议 ban；同日重跑幂等；Token 记录与预算告警生效；失败可告警
- [ ] M4：移动端可查看报告；复制 Markdown 粘贴论坛渲染正常；单发/批量邮件送达可重试；"已警告"标注与全程审计；定向分析结论落库可复制，存在误报信号时建议不为"维持封禁"；报告与定向分析可改备注 / 润色 Markdown / 删除（gmlevel=3、二次确认、审计可查）
