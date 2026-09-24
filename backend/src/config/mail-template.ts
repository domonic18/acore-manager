// 违规警告邮件模板（需求 3.10）：存配置文件不入库；文案正式克制，Owner 评审后可在此调整。
// 占位符 {player}/{reason}/{date} 由 sendMail 逐目标渲染。
// 注意：AC 命令参数单行约束，模板保持单行正文，不使用换行。

export interface MailTemplate {
  subject: string;
  body: string;
}

export interface TemplateVars {
  player: string;
  reason: string;
  date: string;
}

export interface MailTemplateEntry extends MailTemplate {
  key: string;
  name: string;
}

export const WARNING_MAIL_TEMPLATE: MailTemplate = {
  subject: '【服务器管理】违规行为警告',
  body: '亲爱的 {player}：系统检测到您的账号于 {date} 存在异常行为（{reason}）。请您立即停止相关行为，规范游戏。若再次检测到同类违规，我们将依据用户协议对账号采取封禁措施。如有疑问请联系 GM。感谢您的配合。',
};

// 预置模板集：首项为通用警告（报告页一键警告弹窗默认），其余按违规类型细分供 GM 快速选择
export const MAIL_TEMPLATES: MailTemplateEntry[] = [
  { key: 'warning', name: '通用违规警告', ...WARNING_MAIL_TEMPLATE },
  {
    key: 'cheating',
    name: '作弊警告',
    subject: '【服务器管理】作弊行为警告',
    body: '亲爱的 {player}：系统检测到您的角色于 {date} 存在作弊行为（{reason}）。此类行为破坏游戏公平性，请您立即停止。若再次检测到同类违规，我们将依据用户协议对账号采取封禁措施。如有疑问请联系 GM。',
  },
  {
    key: 'language',
    name: '言论不当警告',
    subject: '【服务器管理】言论行为警告',
    body: '亲爱的 {player}：系统检测到您的角色于 {date} 存在不当言论（{reason}）。请您遵守社区规范，文明发言。若再次检测到同类违规，我们将依据用户协议对账号采取禁言或封禁措施。如有疑问请联系 GM。',
  },
  {
    key: 'botting',
    name: '脚本挂机警告',
    subject: '【服务器管理】脚本挂机警告',
    body: '亲爱的 {player}：系统检测到您的角色于 {date} 存在脚本挂机/自动打怪行为（{reason}）。请您立即停止并回归正常游戏。若再次检测到同类违规，我们将依据用户协议对账号采取封禁措施。如有疑问请联系 GM。',
  },
  {
    key: 'bg-farming',
    name: '战场互刷警告',
    subject: '【服务器管理】战场行为警告',
    body: '亲爱的 {player}：系统检测到您的角色于 {date} 存在战场互刷/消极比赛行为（{reason}）。此类行为损害其他玩家的对战体验，请您立即停止。若再次检测到同类违规，我们将依据用户协议对账号采取封禁措施。如有疑问请联系 GM。',
  },
];

export function renderTemplate(tpl: MailTemplate, vars: TemplateVars): MailTemplate {
  const fill = (text: string): string => text.replace(/\{player\}/g, vars.player).replace(/\{reason\}/g, vars.reason).replace(/\{date\}/g, vars.date);
  return { subject: fill(tpl.subject), body: fill(tpl.body) };
}
