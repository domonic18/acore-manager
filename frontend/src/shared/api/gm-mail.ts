import { apiClient } from './client';

// GM 邮件（T4.4，需求 3.10）：发送走 SOAP `.send mail`，逐目标审计落 acm_operation_logs。
// 消费方：ai-diagnosis（报告页处置联动）与 gm-tool（通用发送 + 记录查询），故置于 shared。

export interface MailTemplate {
  subject: string;
  body: string;
}

export interface MailTemplateEntry extends MailTemplate {
  key: string;
  name: string;
}

export interface MailTargetResult {
  name: string;
  guid: number | null;
  online: boolean | null;
  ok: boolean;
  message: string;
}

export interface MailSendInput {
  targets: string[];
  subject: string;
  body: string;
  source: 'template' | 'custom';
  refReport?: string;
}

export interface MailLogItem {
  id: number;
  operatorName: string;
  createdAt: string;
  characterName: string;
  subject: string;
  body: string;
  source: string;
  online: boolean | null;
  ok: boolean;
  result: string;
  refReport: string | null;
}

export const gmMailApi = {
  template: () => apiClient.get<MailTemplate>('/api/gm/mail/template'),
  templates: () => apiClient.get<MailTemplateEntry[]>('/api/gm/mail/templates'),
  suggestNames: (prefix: string) => apiClient.get<string[]>(`/api/characters/suggest?prefix=${encodeURIComponent(prefix)}`),
  send: (input: MailSendInput) => apiClient.post<{ results: MailTargetResult[] }>('/api/gm/mail', input),
  logs: (page = 1, target?: string) =>
    apiClient.get<{ items: MailLogItem[]; total: number }>(
      `/api/gm/mail/logs?page=${page}${target ? `&target=${encodeURIComponent(target)}` : ''}`,
    ),
};
