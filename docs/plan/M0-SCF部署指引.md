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
docker build -f docker/Dockerfile.job -t acm-scf-job:<tag> .
docker login ccr.ccs.tencentyun.com   # 你的 TCR 实例
docker tag acm-scf-job:<tag> <TCR仓库>/acm-scf-job:<tag>
docker push <TCR仓库>/acm-scf-job:<tag>
```

## 二、创建 Job 云函数

- 函数类型：**Job 函数**（容器镜像）
- 镜像：上一步推送的 `<TCR仓库>/acm-scf-job:<tag>`
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
