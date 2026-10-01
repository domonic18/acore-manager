// 详情页「快速分析」按钮 → AI 助手侧边栏调起桥接事件（无全局 store，用 CustomEvent）
// 三个 feature 共用（account / character 详情页派发，ai-assistant Dock 监听），按规范上提 shared
export const AI_QUICK_ANALYZE_EVENT = 'acm:ai-quick-analyze';

export interface QuickAnalyzePayload {
  subjectType: 'account' | 'character';
  name: string;
  guid?: number;
  accountName?: string;
  /** 账号处于封禁状态时携带：分析切换为封禁当天活动 + 误封辨别 */
  ban?: { date: string; reason: string; bannedBy: string };
}

export function buildQuickAnalyzePrompt(payload: QuickAnalyzePayload): string {
  if (payload.subjectType === 'character') {
    return (
      `请对角色「${payload.name}」（guid:${payload.guid ?? '未知'}，账号：${payload.accountName ?? '未知'}）进行今天的行为分析：` +
      '登录与在线情况、金币与交易流水、邮件与拍卖行异常、组队与关联账号风险，最后用中文给出结论摘要。'
    );
  }
  if (payload.ban) {
    return (
      `账号「${payload.name}」已于 ${payload.ban.date} 被封禁（原因：${payload.ban.reason || '未记录'}，操作人：${payload.ban.bannedBy || '未知'}）。` +
      '请分析该账号被封当天的活动记录：登录 IP 与在线时段、名下角色金币变动、交易/邮件/拍卖行为，' +
      '结合封禁原因逐项核对证据，判断该封禁是否可能为误封，最后给出结论与建议（维持封禁/人工复核/建议解封）。'
    );
  }
  return (
    `请对账号「${payload.name}」进行今天的行为分析：` +
    '登录 IP 情况、名下角色金币变动、交易/邮件/拍卖异常，最后用中文给出结论摘要。'
  );
}
