// AI 域常量唯一出处（2026-11 收口）：
// 分两层——
//   1) 运行期可调参数（预算/熔断/步数/超时）走 acm_system_config 配置页，见 system-config.reader.ts；
//   2) 本文件承载**结构性护栏常量**：硬上限、护栏超时、阈值。它们的取值由后端契约、
//      模型广告的 JSON Schema、报告分节契约共同决定，改动即改契约，故留在代码里，
//      但统一到一处，杜绝"散落各文件、各写各的"。
//
// 纪律：本文件只放常量，不放逻辑；新增护栏先在此登记再引用，禁止在业务文件内就近定义上限。

// ── 工具超时（registry 包装层的 per-tool timeoutMs 覆盖值）────────────────
/** 日志解析工具超时：单次扫描量级大（整包解压 + 正则） */
export const PARSE_TOOL_TIMEOUT_MS = 60_000;
/** 异常聚合工具超时：与解析同量级 */
export const ANOMALY_TOOL_TIMEOUT_MS = 60_000;
/** 日志取样/抓取工具超时：单文件读取窗口，应快速返回 */
export const FETCH_TOOL_TIMEOUT_MS = 30_000;

// ── 日志工作区（log-backend / log-workspace）──────────────────────────────
/** 小文件直读阈值：低于此走父类原生路径（mime/binary 语义与上游一致） */
export const READ_FAST_PATH_BYTES = 8 * 1024 * 1024;
/** 单行截断上限：防 crash dump / 无换行 JSON 单行数 MB */
export const MAX_LINE_CHARS = 16_000;
export const MAX_LINE_SUFFIX = '…[line truncated]';
/** grep 默认命中上限（未显式指定 maxCount 时） */
export const GREP_DEFAULT_MAX_MATCHES = 200;
/** grep 输出字节上限：超出即截断，防 stdout 全量累积打穿堆 */
export const GREP_MAX_OUTPUT_BYTES = 1024 * 1024;
export const GREP_TIMEOUT_MS = 30_000;
/** 二进制文件直读上限：超过改走 grep / parse_* 工具 */
export const MAX_BINARY_READ_BYTES = 10 * 1024 * 1024;
/** 二进制嗅探前探字节数 */
export const BINARY_SNIFF_BYTES = 8192;
/** 单个日志包解压后大小上限（SCF /tmp 容量卡口） */
export const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
/** tar 解压命令超时 */
export const TAR_EXTRACT_TIMEOUT_MS = 60_000;
/** 流式读取分块大小 */
export const READ_CHUNK_BYTES = 1024 * 1024;

// ── 日志解析 / 异常聚合（parse-tool / anomaly-tool）────────────────────────
/** 单次查询允许跨越的最大天数 */
export const PARSE_MAX_RANGE_DAYS = 31;
export const ANOMALY_MAX_RANGE_DAYS = 31;
/** 聚合返回条数上限（模型可下调，不可上调） */
export const MAX_AGGREGATES = 50;

// ── 玩家汇总（player-rollup）──────────────────────────────────────────────
/** 单次汇总输出的玩家上限 */
export const ROLLUP_MAX_PLAYERS = 20;
/** 单玩家保留的地图移动记录上限 */
export const ROLLUP_MAX_MAP_MOVES = 20;

// ── 循环传送检测（violation-stats）────────────────────────────────────────
/** 环形轨迹最大环长（点数） */
export const LOOP_MAX_CYCLE = 30;
/** 环形判定邻接半径（码） */
export const LOOP_EPS_YD = 1.0;
/** 环形判定最小直径（码） */
export const LOOP_MIN_DIAMETER_YD = 5.0;

// ── 报告分节契约（report-tools/sections）──────────────────────────────────
/** 可疑玩家分节硬上限：超限报错让模型按严重度裁剪 */
export const REPORT_MAX_PLAYERS = 30;
/** 期望保留的可疑玩家数（报错提示用） */
export const REPORT_TARGET_PLAYERS = 15;
/** 单玩家保留的证据条数上限 */
export const REPORT_MAX_EVIDENCE_PER_PLAYER = 5;
/** 建议分节条数上限 */
export const REPORT_MAX_RECOMMENDATIONS = 20;
/** 单条建议文本长度上限 */
export const REPORT_MAX_RECOMMENDATION_LENGTH = 200;

// ── DB 查询护栏（db-tools/query-guard）────────────────────────────────────
/** 单次查询返回行数上限：超出截断并标记 truncated */
export const DB_MAX_ROWS = 50;

// ── 误报研判（false-positive/explain）─────────────────────────────────────
/** 延迟误报阈值（ms）：平均延迟超过该值时高速类违规可能是网络抖动 */
export const LATENCY_P75_MS = 100;
/** speed 幅度档位跳变区间：中位恰超一个速度档位（服务器认为步行 7 实际坐骑 14 → +100%） */
export const MAGNITUDE_TIER_JUMP = { min: 80, max: 130 };
/** 常规传送白名单：单日次数上限 */
export const ROUTINE_TELEPORT_MAX_COUNT = 5;
/** 常规传送白名单：60 秒窗口爆发次数上限 */
export const ROUTINE_TELEPORT_MAX_BURST60S = 3;

// ── 巡检编排（services/ai/inspection.service）──────────────────────────────
/** 巡检失败重试退避序列（ms） */
export const INSPECTION_RETRY_DELAYS_MS = [1000, 2000, 4000];
/** 重试前置余量下限（ms）：剩余预算不足 max(上一轮耗时, 60s) + 退避时不再重试——
 *  上一轮耗时是下一轮工作量的最好估计；60s 下限保证快速轮（测试/小日志）始终可重试 */
export const MIN_RETRY_HEADROOM_MS = 60_000;

// ── 飞书通知（services/ai/feishu-notify.service）──────────────────────────
/** 飞书 webhook 重试退避（ms） */
export const FEISHU_RETRY_BACKOFF_MS = 1000;
/** 飞书卡片中展示的可疑玩家条数 */
export const TOP_PLAYERS_IN_CARD = 5;
/** 飞书卡片摘要文本长度上限 */
export const CARD_SUMMARY_MAX_LENGTH = 200;
/** 飞书卡片单条理由文本长度上限 */
export const CARD_REASON_MAX_LENGTH = 100;

// ── 其它常量（事实性，非护栏）──────────────────────────────────────────────
/** 日志时间解析用的 CST 偏移（UTC+8） */
export const CST_OFFSET_MS = 8 * 3600 * 1000;
