# M0 Spike 结论（迭代十 AI 诊断 / 前置验证）

> 状态：截至 2026-09-22。T0.1 / T0.3 已有结论（T0.3 完整跑通），
> T0.2 / T0.4 / T0.5 为你侧动作（部署实测 / 授权执行 / 填模板），完成后回填本文件。

## 结论总览

| 编号 | 验证项 | 结论 | 状态 | 对后续里程碑的影响 |
|------|--------|------|------|-------------------|
| T0.1 | SCF Web 函数 SSE 兼容性 | **支持**（squadsight 项目已实测验证） | ✅ 完成 | T2.8 SSE 流式方案锁定，无需专门降级分支（保留非流式整段返回作异常兜底） |
| T0.2 | SCF Job 函数资源上限 | 待实测 | ⏳ 你侧部署 | 实测结论决定 T3.3 是否按日志类型拆分多次 Job |
| T0.3 | deepagents JS + 库配置链路 | **全链路跑通**；重大架构决策：acm 库迁移 PostgreSQL | ✅ 完成 | T2.1/T2.4 技术路线锁定并提前落地（见下文细节） |
| T0.4 | 生产 `daily_players_reports` 写入确认；`.send mail` 离线角色支持 | **`.send mail` 已实测：离线角色受理入邮箱**（2026-09-23，见下）；生产表只读 SQL 仍待授权 | 🔶 邮件已实测 / 生产 SQL 待授权 | 邮件照发策略成立（T4.4 无需待发清单）；无写入则反作弊 DB 聚合工具降级，日志解析为唯一权威来源 |
| T0.5 | Owner 误报数据调研 | 模板已备 | ⏳ Owner 填写 | 填写结果作为 T2.7 误报引擎初始配置 |

## T0.1 SSE（已完成，无需部署）

- **结论**：腾讯云 SCF Web 函数支持 SSE 长连接流式响应。
- **证据**：squadsight 项目在生产 SCF Web 函数上的 SSE 实测（Owner 确认，2026-09-21）。
- **决策**：需求开放问题 2 关闭；M2 assistant 对话采用 SSE 流式输出。

## T0.2 Job（待你侧实测）

- **物料**：`docker/Dockerfile.job`（Job 专用镜像，基座 node:22-alpine）+ `backend/src/job/inspection-job.ts`（fixture 下载 → /tmp 解压 → 扫描 → 耗时内存 JSON）。
- **本地基线**：合成 fixture（20 文件约 300KB）总耗时 66ms / RSS 41MB / 子进程 tar 正常。
- **部署步骤与待记录指标**：见 `docs/plan/M0-SCF部署指引.md`。
- **待回填**：/tmp 上限、子进程允许性、出站网络、内存水位、时长余量、退出码判定。

## T0.3 deepagents JS（✅ 已完成，2026-09-22）

### 最终验证结果（证据均在 `backend/poc/agent/`，运行记录见下）

1. **库配置 → 模型构建全链路**：`ai_model_config` 默认行（kimi / kimi-for-coding / anthropic 协议）→ AES-256-GCM 解密 → 按协议分派模型客户端（anthropic → `ChatAnthropic(anthropicApiUrl)`；openai → `ChatOpenAI(baseURL)`）。
2. **两轮对话 + 工具调用**：echo 工具正确返回 `acm-poc-2026`；第二轮不调工具即可回忆该字符串（进程内记忆 ✅）。
3. **跨进程持久化**：全新进程以 `resume` 模式仅问第三轮问题，准确答出第一轮回显字符串（checkpoint 持久化 ✅）。
4. **streamEvents 事件源**：`on_chat_model_stream`（≈80 次）/ `on_tool_start|end` / `on_chain_*` 全部出现 → T2.8 SSE 协议映射可行。
5. **require(ESM)**：Node v22 下 `require('deepagents')`（1.14.0，ESM-only）原生可用，主工程 CJS 模块策略不变。

### 重大发现与架构决策（驱动需求 v2.5 / 架构 v1.3 变更）

| # | 发现 | 决策 |
|---|------|------|
| 1 | **RedisSaver 硬依赖 RedisJSON + RediSearch 模块**：本地 redis:7-alpine 无模块，`JSON.SET` / `FT.CREATE` 直接报 unknown command；生产与 ranking 共享的腾讯云 Redis 亦不满足 | **acm 自有库改用 PostgreSQL**，checkpointer 换官方 `@langchain/langgraph-checkpoint-postgres`（PostgresSaver，无模块依赖）；compose 新增 `acm-postgres` 服务（5433），生产用腾讯云托管 PG |
| 2 | **PG checkpoint 无 TTL 语义**（RedisSaver 的 defaultTTL 不复存在） | 会话清理由后端定期 `deleteThread` 任务按保留策略实现（归入 T2.8 会话管理范围） |
| 3 | **anthropic 协议配置需要专用客户端**：ChatOpenAI 打 anthropic 端点不可行 | agent-factory 按 `protocol` 字段分派：`openai` → ChatOpenAI / `anthropic` → ChatAnthropic |
| 4 | **node:20 镜像不可用**：deepagents 传递依赖 `openai@7` 要求 node≥22；且 npm 10.8（node20 自带）存在 "Exit handler never called" bug 导致 node_modules 残缺安装 | Web/Job 镜像基座统一升级 **node:22-alpine**；svg-captcha 字体包名适配 Alpine 新版（`ttf-dejavu` → `font-dejavu`） |
| 5 | **数据迁移零成本**：api_key 为 AES-GCM 密文（密钥不变），MySQL → PG 直接搬运密文即可解密 | 一次性脚本 `backend/poc/agent/migrate-mysql-to-pg.ts`（已执行，kimi 配置行已迁移且 UI/服务层验证通过） |

### 运行记录

```
默认模式：turn1 echo 工具调用 → 返回 acm-poc-2026；turn2 无工具回忆成功
          streamEvents 事件统计：on_chat_model_stream x82 / on_tool_start|end x1 / on_chain_* x23
          PG checkpoint：thread poc-1 = 12 条、poc-2 = 7 条（PostgresSaver setup 幂等建表）
resume 模式：全新进程 → 直接回答 acm-poc-2026（跨进程记忆 ✅）
端到端：容器（node:22 + acm PG 数据源）health OK；llm-config 服务列表/掩码/解密正常
主工程：npm run build ✅、npm test 20 suites / 95 tests 全绿
```

### 遗留事项（归入 M2）

- checkpoint 表（checkpoints / checkpoint_blobs / checkpoint_writes）由 PostgresSaver `setup()` 自管，不纳入 `acm_migrations` 迁移体系——多实例并发 setup 的安全性待 T2.4 关注（当前单实例无影响）。
- 会话保留策略与 deleteThread 定期任务的具体参数（T2.8）。

## T0.4 生产库只读确认（待你授权后执行）

以下 SQL 在生产 characters 库**只读**执行（凭据在 acore-deploy/.env，执行前请确认）：

```sql
-- 1. 报告表写入量与最近时间（判断 cron 是否仍在写入）
SELECT COUNT(*) AS total_rows, MAX(report_time) AS latest_report
FROM characters.daily_players_reports;

-- 2. 近 7 天按日分布（判断写入是否连续）
SELECT DATE(report_time) AS d, COUNT(*) AS c
FROM characters.daily_players_reports
WHERE report_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY d ORDER BY d;

-- 3. 抽样 3 行看字段结构（供 DB 聚合工具开发参考）
SELECT * FROM characters.daily_players_reports ORDER BY report_time DESC LIMIT 3;

-- 4. 表结构留档
SHOW CREATE TABLE characters.daily_players_reports;
```

- **回填处**：本节下方 + 需求开放问题 9。
- 另：`.send mail` 离线角色实测（开放问题 5）**已完成（2026-09-23）**，见下节。

### T0.4-a `.send mail` 离线角色实测（✅ 2026-09-23）

- **链路**：acore-manager `POST /api/gm/mail` → SOAP（frpc 隧道 175.27.167.123:7878）→ 本地测试 worldserver → auth 库账号校验（ADMIN_SOAP，security level 满足 gm2 门禁）。
- **离线角色**：目标 Aix（online=0）→ worldserver **受理**，回执"邮件寄给 Aix"；`acore_characters.mail` 落库（deliver_time 已写入），登录后可取 → **照发策略成立，T4.4 无需待发清单/常驻队列**（需求开放问题 5 关闭）。
- **不存在角色**：应用层先行库校验即拒（"角色不存在"），失败隔离不阻塞其他目标，审计 target=`name:XXX`。
- **中文内容**：UTF-8 subject/body 经 XML 转义往返后落库完好（utf8mb4 验证）。
- **处置闭环**：发送后报告详情 suspiciousPlayers `warned: false → true`（审计反查富化）。
- **过程中发现并处理**：SOAP 账号 ADMIN_SOAP 密码与 auth 库记录不匹配（401），已由 Owner 在世界端控制台 `.account set password` 重置；回执含 `&#xD;` 实体残留，已在 gm-tool.service 解码。

## T0.5 Owner 调研（模板已备）

- 模板：`docs/plan/M0-Owner调研模板.md`（易误报地图 / 移动类光环 spell / 已知外挂特征三张表）。
- 填写结果 → T2.7 误报引擎初始配置；后台 UI（ai_anticheat_exemption）做运行时维护。

## 门禁决策摘要

- **T2.1 可开工**：模块策略（CJS + require(ESM)）、acm 库（PG）SQL 迁移体系、ai_model_config 表均已落地。
- **T2.4 正式解锁**：agent-factory / PostgresSaver checkpointer 技术路线经完整运行验证，无阻断风险。
- **T2.8 无降级分支**：SSE 已确认支持；会话清理改为 deleteThread 任务。
- **T3.3 拆分策略**：等 T0.2 实测数据回填后决策。
