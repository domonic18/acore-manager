# M0 SCF 部署指引（T0.2，需在你侧执行实测）

> 目标：验证腾讯云 SCF **Job 函数**（容器镜像）能否承载 ACM 的一次性日志扫描任务（内存 / 时长 / /tmp / 子进程 / 出站网络）。
> T0.1（Web 函数 SSE 兼容性）已在 squadsight 项目实测**支持**，无需部署验证。

## 产物清单

| 文件 | 职责 |
| --- | --- |
| `backend/src/job/inspection-job.ts` | Job 验证桩：下载/生成 fixture tar.gz → /tmp 解压 → 扫描 → 输出耗时与内存 JSON 后退出 |
| `docker/Dockerfile.job` | Job 函数**专用镜像**（与 Web 单体镜像分开构建；无前端产物、无字体依赖，CMD 直指一次性任务） |

本地基线（宿主机，供 SCF 结果对比）：合成 fixture（20 文件约 300KB）总耗时 66ms / RSS 41MB。

## 一、构建 Job 镜像（本地即可）

```bash
# 仓库根目录
docker build -f docker/Dockerfile.job -t acore-manager-job:<tag> .
docker login ccr.ccs.tencentyun.com   # 你的 TCR 实例
docker tag acore-manager-job:<tag> <TCR仓库>/acore-manager-job:<tag>
docker push <TCR仓库>/acore-manager-job:<tag>
```

## 二、创建 Job 云函数

- 函数类型：**Job 函数**（容器镜像）
- 镜像：上一步推送的 `<TCR仓库>/acore-manager-job:<tag>`
- 环境变量：
  - 可选 `JOB_FIXTURE_URL=<公网可下载的 tar.gz>`（不设则本地合成 20 个 500 行日志文件，约 300KB）
  - **不要**配 DB/Redis（本次仅验证容器运行时能力）
- 内存 512MB、超时 60s 起步；触发方式选**手动触发/测试事件**

## 三、观测方法

直接在 SCF 控制台触发；函数 stdout 末尾输出 JSON 报告：

```json
{
  "mode": "synthetic-fixture",
  "downloadMs": 12, "downloadBytes": 300160,
  "extractMs": 30, "scanMs": 45,
  "files": 20, "bytes": 190000, "matchedLines": 1100,
  "totalMs": 120, "memoryRssMB": 68, "memoryHeapUsedMB": 41
}
```

## 四、需记录指标（回填到 M0-Spike结论.md T0.2 节）

- [ ] /tmp 可写容量上限（可用大 fixture 试探，或控制台文档值）
- [ ] 子进程（tar）是否被允许执行（extractMs 是否产出、是否有 seccomp 拦截日志）
- [ ] 网络出站是否可用（remote-fixture 模式下载是否成功、耗时）
- [ ] 内存水位：报告 rss 与 SCF 配置内存的比值（预估未来真实扫描任务配额）
- [ ] 时长：totalMs 与函数超时的余量（预估全 agentic 分析是否需拆分多次 Job）
- [ ] 一次性进程退出码 0 是否被 SCF 判定为成功

## 五、验证后清理

- [ ] 删除 SCF 上测试函数（避免计费）
- [ ] TCR 中的 job 测试镜像按需清理
- [ ] 代码侧 `src/job/inspection-job.ts` 保留至 T3.3 正式实现时改造，无需删除

---

## 六、生产 Job 部署清单（M1 消费端落地，控制台操作）

> 前置：CI 已随 app 镜像同步构建 Job 镜像（`docker/Dockerfile.job` →
> `<TCR>/acore-manager-job:<branch>-<sha>` + `latest`，tag 规则与 app 镜像一致）。
> 上游数据由 acore-deploy 的 `scripts/acore-upload-logs.sh` 每日 04:30 上传至
> `cos://wow-warden-1259353115/acore-logs/realm2/{date}/`（生产 realm 为 realm2，
> 本地测试环境为 realm3）。

### 函数创建

- 函数类型：**Job 函数**（容器镜像）
- 镜像：`<TCR>/acore-manager-job:latest`（CI 按 push 分支产出 `develop-<sha>` / `main-<sha>`，`latest` 跟随最近一次构建、两分支共享；生产建议锁定具体 `<分支>-<sha>`。TCR 私有仓需在 SCF 配置镜像拉取凭证）
- 内存：1024MB 起步（T0.2 基线为 20 文件 fixture；真实四类日志 + LLM 分析首周观察后调整）
- 超时：900s 起步（本地全链路实测约 105s，生产日志量更大，留 8 倍余量）
- 执行方法：镜像 ENTRYPOINT 已固定为 `node dist/job/job-entry.js`，事件无需额外配置。
  事件 JSON 契约：`{"task":"inspection","params":{"date":"YYYY-MM-DD","realm":"realm2","trigger":"cron|manual"}}`
  （date 缺省取 CST 昨日、realm 缺省回落设置页 default_realm、trigger 缺省 cron；
  事件经容器环境变量 `SCF_CUSTOM_CONTAINER_EVENT` 注入，本地调试：
  `SCF_CUSTOM_CONTAINER_EVENT='<json>' node dist/job/job-entry.js`）

### 定时触发器

- 名称：`inspection-daily`；类型：定时触发
- Cron：`0 0 6 * * * *`（每日 06:00，SCF 触发器时区为 UTC+8）
- 附加消息（函数入参）：`{"task":"inspection","params":{"trigger":"cron"}}`
  （date/realm 不传：Job 侧缺省取 CST 昨日 + 设置页 default_realm，不依赖触发器动态参数）

### 环境变量（与代码 `backend/src/config/env.ts` 键名逐一对应）

| 键 | 说明 |
| --- | --- |
| `DB_URL` | 游戏库 MySQL 只读连接串（Job 建立全量数据源连接用） |
| `ACM_DB_URL` | acm 库 PostgreSQL 连接串（报告/审计/checkpoint 写入） |
| `REDIS_URL` | Redis 连接串（巡检摘要缓存） |
| `COS_SECRET_ID` / `COS_SECRET_KEY` | 日志桶读取凭证 |
| `COS_BUCKET` | `wow-warden-1259353115` |
| `COS_REGION` | `ap-beijing` |
| `FEISHU_WEBHOOK_URL` / `FEISHU_WEBHOOK_SECRET` | 日报/断传告警推送（含加签）；可选，已支持系统配置页维护，DB 值优先 |
| `ACM_WEB_BASE_URL` | 日报卡片跳转 Web 基地址；可选，已支持系统配置页维护 |
| `TZ` | 建议值 `Asia/Shanghai`：「昨日」日期计算内建 CST 偏移不依赖时区（`yesterdayCST`），TZ 影响的是函数日志时间戳可读性 |

### 模型配置前置

- Agent 模型协议/密钥存于 acm 库模型配置表（不走环境变量）；部署前确认生产 acm 库
  已配置 inspection 场景可用模型（本地联调使用 `kimi` 协议 ChatOpenAI）

### Web 函数前置（「立即巡检」按钮 → SCF Invoke 控制面触发）

> 巡检执行一律在 Job 函数，Web 端通过 SCF Invoke API（`InvocationType=Event`，TC3 自签名）
> 异步受理，不重、不降级。Web 函数需新增以下环境变量（与 `backend/src/config/env.ts` 对应）：

| 键 | 说明 |
| --- | --- |
| `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` | CAM 子账号密钥，需授权 `scf:InvokeFunction`（建议自定义策略把资源限定到 `qcs::scf:<region>:uin/<主账号UIN>:namespace/<ns>/function/<函数名>`） |
| `SCF_REGION` | Job 函数所在地域（如 `ap-guangzhou`） |
| `SCF_NAMESPACE` | Job 函数所在命名空间，默认 `default` |
| `SCF_JOB_FUNCTION_NAME` | Job 函数名 |

- 四项主配置缺任一：触发接口快速失败并报缺失变量名，不做本地直跑回退
- 常见错误码：`AuthFailure.SignatureFailure`（密钥错）/ `AuthFailure.UnauthorizedOperation`（未授权
  scf:InvokeFunction）/ `ResourceNotFound.Function`（函数名或命名空间错）；签名类错误若报
  `SignatureExpire` 先查宿主机时钟（TC3 允许 ±5 分钟）

### 上线验证

- [ ] 控制台手动触发一次（附加消息 `{"task":"inspection","params":{"date":"<昨日>","trigger":"manual"}}`）：
      exit 0、`ai_report` 新增记录、飞书日报卡片送达；同时确认容器日志出现入口解析后的事件
- [ ] Web 端「立即巡检」按钮触发一次：toast 成功 + 响应含 requestId，Job 函数日志可见对应调用
- [ ] 次日 04:30 上游上传后 06:00 定时触发自动成功，连续观察 3 天（M1 验收）

---

## 七、本地 Docker 全链路验证（web 容器 → scf-mock → job 容器）

> 不依赖腾讯云，在本机用容器验证「立即巡检」真实链路：web 容器发出**真实 TC3 签名 Invoke**
> → `scf-mock` 容器（模拟 `scf.<region>.tencentcloudapi.com`，见 `docker/scf-mock/server.mjs`）
> 复核签名并按 Event 语义返回 RequestId → 派生 **job 容器**（真实 `docker/Dockerfile.job` 镜像，
> 事件经 `SCF_CUSTOM_CONTAINER_EVENT` 注入）执行巡检。接入方式 = `SCF_ENDPOINT` 端点覆盖
> （同 AWS_ENDPOINT_URL 惯例，代码路径与生产完全一致，无本地直跑分支）。

### 步骤

1. 准备环境覆盖：`cp .env.e2e.example .env.e2e`，把其中各连接串的 host 改为
   `host.docker.internal`（端口/库名/凭证照抄 `.env`；本地 acm PG 容器已发布 5433）
2. 起栈（首次会自动构建 web 与 job 镜像，job 镜像由 scf-mock 按需构建）：

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build app scf-mock
   ```

3. 浏览器 http://localhost:9010 → AI 诊断 →「立即巡检」：toast 成功且响应含 requestId
4. 观察执行（等价 SCF 控制台日志）：

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.e2e.yml logs -f scf-mock
   # 期望：签名复核通过 → [job acm-job-xxxx] 巡检日志 → 完成 exit=0 elapsed=…
   ```

5. 报告页刷新可见 `trigger=manual` 新报告；验证完清理：`docker compose -f docker-compose.yml -f docker-compose.e2e.yml down`

### 排障

- toast 报 `AuthFailure.SignatureFailure`：两侧密钥须一致（compose 注入的哑凭证
  `local-mock-id/local-mock-key`）；报 `SignatureExpire` 先查宿主机时钟
- `[job acm-job-…] 派生失败`：确认 Docker Desktop 已启动、docker.sock 挂载成功
- job 内数据源连接失败（exit=2）：核对 `.env.e2e` 的 host 是否已全部换成 `host.docker.internal`
- 直接 curl 调试 mock（无签名头应被拒）：

  ```bash
  curl -s http://localhost:9011 -X POST -H 'Content-Type: application/json' -d '{"InvocationType":"Event","ClientContext":"{\"task\":\"ping\"}"}'
  # 期望 {"Response":{"Error":{"Code":"AuthFailure.SignatureFailure",…}}}
  ```
