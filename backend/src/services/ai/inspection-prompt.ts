import { LOG_TYPES } from '@/agent/tools/log-tools/log-workspace';
import { REPORT_SCHEMA_VERSION } from '@/agent/tools/report-tools';

// 巡检任务提示词（纯函数，inspection.service 拆分）：manifest 状态说明 + 取证步骤建议
// + write_report_section 分节落盘契约 + 五字段最终小 JSON 约定与硬性要求
// + 抗摇摆执行纪律（SquadSight 线上事故同款 SOP）。

// 抗摇摆纪律：工具校验硬拒后模型易"反向误诊 → 换策略/放弃落盘改叙述"，烧尽步数
// 且叙述文本会被代码层丢弃（报告只认草稿文件）。SOP：只修参数、同工具重试。
const EXECUTION_DISCIPLINE =
  '执行纪律：工具调用被拒（返回 error）时，只按报错说明修正参数后用同一工具重试；' +
  '禁止因校验失败放弃分节落盘，禁止把分节内容改写进最终消息。';

export function buildInspectionTaskPrompt(
  realm: string,
  date: string,
  manifest: { absent: boolean; missingTypes: string[] },
): { messages: { role: string; content: string }[] } {
  const manifestNote = manifest.absent
    ? `当日 manifest.json 不存在（疑似断传）。请先用 get_log_manifest 复核；若确认无日志，报告如实说明并给 healthScore 低分。`
    : manifest.missingTypes.length > 0
      ? `当日日志不完整：仅部分类型可用，缺失 ${manifest.missingTypes.join(' / ')}。只分析已有部分，并在落盘分节中说明缺失项。`
      : `当日四类日志齐全（${LOG_TYPES.join(' / ')}）。`;
  const content = [
    `请执行 ${realm} 服务器 ${date} 的每日巡检，产出结构化诊断报告。`,
    ``,
    `当日日志清单状态：${manifestNote}`,
    ``,
    `取证步骤建议：`,
    `1. get_log_manifest 复核日志构成`,
    `2. fetch_log_archive 拉取 anticheat 归档（优先）及其他可用类型`,
    `3. parse_anticheat_violations(from, to, explain=true) 做代码级违规聚合与误报解释`,
    `4. 可疑玩家用 get_anticheat_record / get_character_overview / get_character_auras 佐证`,
    `5. parse_server_anomalies(from, to) 扫描 server/auth 日志异常标记（cheat 语句、AntiDOS 洪水、失败登录爆破）`,
    `6. 每完成一个维度立即调用 write_report_section 落盘对应分节，禁止攒到最后一次性输出`,
    ``,
    `反作弊研判规则（代码信号优先，禁止只凭违规计数下结论）：`,
    `1. falsePositiveSignals 含"已知误报场景"（如 地图33影牙城堡×zaxis：副本地面平坦致 Z 轴恒定）时，`,
    `   该类违规禁止作为封禁依据；若该玩家此类计数仍在持续累积，在 recommendations 中提示`,
    `   "反作弊模块阈值累计可能自动误封，建议提前核实或准备解封"。`,
    `2. speed 按 magnitude/pattern 三步判定：a) magnitude.median 在 +80~130% 且 pattern=pulsed →`,
    `   坐骑/状态切换惯性误报候选，不得 ban；b) pattern=continuous（60s 窗口≥5 条或间隔中位≤60s）`,
    `   且幅度大、无相反信号 → 持续外挂证据充分方可 ban；c) 其余情形 → investigate 并列明不确定点。`,
    `3. teleport/teleportplane：工具标注 routine/quest 信号（单发或稀疏 ≤5 条且无 60s 爆发，如任务传送点/炉石/飞行点/进出副本）`,
    `   的玩家不进 suspicious-players（确需提及则 severity=low 且 suggestedAction=warning）；`,
    `   仅当同玩家 teleport 类呈 continuous/高爆发，或与其他类型（speed/fly/zaxis 等）同日并发时才入围。`,
    `4. zaxis 的计数与时间形态不构成判据（副本平坦地面几何性触发），只认场景库标注与 GM 复核。`,
    `5. suggestedAction 只能取 warning/investigate/ban；工具返回的 suggestedAction 已对齐契约，可直接引用。`,
    `6. 地图轨迹（players[].maps / mapMoves）：报告须写明可疑玩家的活动地图（中文名）与跨图迁移链`,
    `   （从哪张图 → 哪张图，附 jumpYards 瞬移幅度），提升人工审核可读性；跨图跳变先排查`,
    `   随机本/集合石/飞行点/炉石等合法传送，同图内反复出现 maxJumpYards≥50 码（模块阈值）的瞬移才构成作弊证据。`,
    `7. loopLength 非空表示同一坐标序列逐点精确重复 ≥2 轮（脚本化寻路/定点循环外挂强证据，`,
    `   如哀嚎洞穴 13 点循环 ×2），可据此建议 ban；该证据方向与误报信号相反，禁止写入 falsePositiveSignals。`,
    `8. server 日志异常标记（parse_server_anomalies 的 players）：loot-respawn 单次多为节点竞速/多开采集/`,
    `   客户端状态残留误判，同一玩家当日跨多节点重复才构成采集外挂嫌疑；quest/auction/foreign-account-access`,
    `   等 high 级标记须列入 suspicious-players 并给出证据摘录；authFailures.bruteForceSuspect 的 IP`,
    `   直接写入 server-health 并在 recommendations 提示封禁/拉黑。authFailures 已在代码层剔除受信 IP`,
    `   （站长自有服务的合法认证流量），返回列表中的 IP 均为待审可疑来源，禁止用 grep 等方式从原始日志`,
    `   外推其他 IP 补入报告；trustedIpsExcluded 为受信 IP 的剔除统计（合法业务流量，非安全威胁），`,
    `   authFailures 为空而 trustedIpsExcluded 非空属预期结果（当日失败登录全部来自受信来源），`,
    `   authAnomalies 留空即可——禁止把受信 IP（含其尝试登录已封账号等任何行为）从原始日志`,
    `   检索后重新写入报告或建议。`,
    `9. 强作弊特征必须入围（即使仅单条）：a) speed 幅度 >1000%（正常坐骑/状态切换不会出现，`,
    `   多为瞬移型外挂痕迹）；b) timemanipulation（"Time Diff Corrected" 主动反制 = 变速齿轮类工具，`,
    `   无法用误报解释）。命中任一的玩家必须进 suspicious-players 且 severity≥high——`,
    `   此类记录可在封禁前数日出现，是提前预警的关键线索。`,
    ``,
    `历史误封校准案例（真实申诉复盘，判定口径参考）：`,
    `- 影牙城堡(地图33) 20 级法师被带刷：当日 zaxis 103 次全部位于地图33、坐标集中约 45×15 码、延迟 0-11ms → 模块自动永封，核实为误封解封。`,
    `- 影牙城堡 34 级猎人：8 分钟 260 次 Ignore Zaxis（Z 恒定 ~91.5）→ 自动永封解封；同日合法传送（飞行点/炉石）另被误记为 Teleport 与极端 Speed。`,
    ``,
    `分节落盘契约（write_report_section 的 section / content）：`,
    `- "server-health"：{"crashes":[当日崩溃摘要],"errors":[错误统计],"authAnomalies":[认证异常摘要],"cheatMarkers":[server 日志异常标记摘要（玩家×标记 + 爆破 IP）]}（无则空数组）`,
    `- "suspicious-players"：[{"character","account","severity":"high|medium|low","suggestedAction":"warning|investigate|ban","reasons":["…"],"evidence":["原始日志摘录"],"falsePositiveSignals":[],"suggestion":"…"}]，按严重度取 top ≤15 名，每人 evidence ≤5 条；suggestion 中给出地图轨迹叙事（活动地图中文名 + 从哪张图迁移到哪张图），loopLength/maxJumpYards 等关键数值直接引用`,
    `- "recommendations"：["处置建议…"]（≤20 条，每条 ≤200 字）`,
    ``,
    `三节全部落盘后，最终消息只输出一个五字段小 JSON（可置于 \`\`\`json 围栏中），除此之外不得输出任何明细、markdown 全文或解释文字：`,
    `{"schemaVersion": ${REPORT_SCHEMA_VERSION}, "reportDate": "${date}", "realm": "${realm}", "healthScore": <0-100 整数>, "summary": "<一段话总结，≤200 字>"}`,
    ``,
    EXECUTION_DISCIPLINE,
    ``,
    `硬性要求：falsePositiveSignals 非空的玩家 suggestedAction 不得为 "ban"；证据必须来自工具返回的原文摘录，禁止编造；无日志支撑的维度如实写"无数据"。`,
    `游戏信息表述：金额引用工具返回的 *Text 格式化字段（如 21金50银6铜），禁止"约 X 万"式换算；`,
    `种族/职业/地图/区域名引用 raceName/className/mapName/zoneName，坐标不得用于推断区域名；`,
    `任务/物品/节点 ID 引用前先 get_game_references 查名，查不到以纯 ID 表述，禁止自行翻译 ID 或编造名称。`,
    `游戏词条超链接：markdown 输出中用工具返回的 url 作 [名称](url) 链接；纯文本分节中词条用`,
    `「任务/物品/节点/NPC {id}」标准前缀逐个表述（禁止"9312/9473"连写），系统会自动把前缀+ID 链接化。`,
  ].join('\n');
  return { messages: [{ role: 'user', content }] };
}

// 最终小 JSON 校验失败追问轮：不再无条件断言"分节已落盘"（假前提会诱导模型跳过补落盘），
// 改为状态中立的指引——若尚未落盘，先补齐再输出小 JSON
export function buildJsonFixPrompt(parseIssue: string): { messages: { role: string; content: string }[] } {
  return {
    messages: [
      {
        role: 'user',
        content:
          `你上一轮的输出无法解析为符合约定的 JSON，问题：${parseIssue}。` +
          `请重新只输出最终小 JSON：从 { 开始到 } 结束的一个完整对象，仅含 schemaVersion/reportDate/realm/healthScore/summary 五个字段，` +
          `不要使用 markdown 代码块，不要续写上文，不要输出任何解释文字。` +
          `分节结论以你已通过 write_report_section 落盘的草稿为准；若尚有分节未落盘，请先调用 write_report_section 补齐后再输出小 JSON。`,
      },
    ],
  };
}

// 分节抢救轮：JSON 已合规但草稿缺节时，同线程追问落盘挽回整轮工作
// （SquadSight「缺失清单 + 局部修补」模式）——分析结论仍留在上下文中，只差落盘动作
export function buildSectionSalvagePrompt(missing: readonly string[]): { messages: { role: string; content: string }[] } {
  return {
    messages: [
      {
        role: 'user',
        content:
          `报告缺节：${missing.join(' / ')}——这些分节的草稿尚未落盘（write_report_section 未被成功调用）。` +
          `你此前的分析结论仍在上下文中，请立即按分节落盘契约逐节调用 write_report_section 补齐：` +
          `content 按契约传 JSON（禁止包成字符串），缺哪节补哪节，已落盘的节无需重写。` +
          `全部补齐后，最终消息只重新输出五字段小 JSON，除此之外不得输出任何明细或解释文字。` +
          `${EXECUTION_DISCIPLINE}`,
      },
    ],
  };
}
