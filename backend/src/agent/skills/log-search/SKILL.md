---
name: log-search
description: AzerothCore 服务端原始日志的 grep-first 检索方法论。当需要在已解压的工作区日志（anticheat / worldserver / authserver / Server / Errors / gm 等）中定位错误、崩溃、登录异常或特定玩家行为证据时使用：先用 ls 与 grep 缩小范围，再按行号 read_file 精读片段，避免全文倾倒浪费 token。
---

# log-search：日志检索方法论

## 路径约定

- 文件工具使用虚拟根路径，日志工作区位于 `/{realm}/{date}/{type}/`。
- `fetch_log_archive` 返回的 `files[].path` 是该类型目录下的相对文件名，
  自行拼接完整虚拟路径，例如 `/realm3/2026-08-22/anticheat/anticheat_2026-08-22.log`。
- 检索前先 `ls` 目标目录确认文件存在；目录不存在说明该类型日志未拉取，
  先调 `fetch_log_archive`，而不是臆测文件名。

## grep-first 流程

1. **明确意图**：先想清楚要找什么（错误聚合 / 崩溃现场 / 某玩家 / 某时间段），避免无目的漫游。
2. **量级先行**：先统计命中数量（计数模式），量级过大就增加约束（时间窗口、玩家名、错误码）再搜。
3. **定位行号**：带行号输出命中行，命中密集时段用首末行号估计时间跨度。
4. **精读片段**：用 offset/limit 按行号窗口读取上下文（±5 行通常足够），禁止不指定窗口地读取大文件。
5. **原文引用**：报告引用证据时保持日志行原文，不做改写删减；时间戳保留完整。

## 常用检索词

- 服务器错误：`ERROR`、`FATAL`、`DB error`、`SQL`、`timeout`
- 崩溃信号：`Crash`、`Segmentation`、`backtrace`、`signal`
- 登录异常：`Failed login`、`wrong password`、`banned account`、`IP`
- GM 操作：`Command`、`GM`、账号/角色名

## 分工边界

- **anticheat 违规**：一律先用 `parse_anticheat_violations` 结构化解析（省 token 且可聚合），
  仅当需要某条违规的上下文（前后日志行）时才对 anticheat 原文做定向 grep。
- **自由格式日志**（Server / Errors / gm 等）：本方法论是唯一手段，逐层缩小范围。
- 单次巡检工具调用有预算上限（默认 20 次），每次检索都要有明确目的。
