import { apiClient, buildUrl } from '@/shared/api/client';

// AI 诊断报告（T4.1）：列表摘要 / 详情全量 / 近 7 天日志上传状态。
// 字段与后端 AiReport 实体及 InspectionReportJson 对齐（camelCase 由 TypeORM 实体保证）。

export interface AiReportSummary {
  id: number;
  realm: string;
  reportDate: string;
  healthScore: number;
  summary: string;
  status: string;
  generatedBy: string;
  gmRemark: string | null;
  updatedAt: string;
}

export interface SuspiciousPlayer {
  character: string;
  account?: string;
  severity: 'high' | 'medium' | 'low' | string;
  suggestedAction: string;
  suggestion?: string;
  reasons?: string[];
  evidence?: string[];
  falsePositiveSignals?: string[];
  // T4.3 响应层富化：后端按角色名回查，已删除角色缺失时前端降级纯文本
  characterGuid?: number;
  accountId?: number;
  accountUsername?: string;
  // T4.5：审计记录存在 gmtool.mail.send 时为 true
  warned?: boolean;
}

export interface ReportServerHealth {
  crashes?: unknown[];
  errors?: unknown[];
  authAnomalies?: unknown[];
}

export interface AiReportDetail extends AiReportSummary {
  contentJson: {
    serverHealth?: ReportServerHealth;
    suspiciousPlayers?: SuspiciousPlayer[];
    recommendations?: string[];
  };
  contentMarkdown: string;
  tokenUsage: { prompt?: number; completion?: number; total?: number } | null;
}

export interface UploadStatusDay {
  date: string;
  present: boolean;
  missingTypes: string[];
}

export interface ExemptionItem {
  id: number;
  characterGuid: number;
  violationType: string;
  mapId: number | null;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface ExemptionInput {
  characterGuid: number;
  violationType: string;
  mapId?: number | null;
  reason: string;
}

export const aiDiagnosisApi = {
  reports: (realm?: string) =>
    apiClient.get<AiReportSummary[]>(`/api/ai/diagnosis/reports${realm ? `?realm=${encodeURIComponent(realm)}` : ''}`),
  report: (realm: string, date: string) =>
    apiClient.get<AiReportDetail>(`/api/ai/diagnosis/reports/${encodeURIComponent(realm)}/${date}`),
  uploadStatus: (realm: string, days = 7) =>
    apiClient.get<UploadStatusDay[]>(`/api/ai/diagnosis/upload-status?realm=${encodeURIComponent(realm)}&days=${days}`),
  removeReport: (realm: string, date: string) =>
    apiClient.del<{ success: boolean }>(`/api/ai/diagnosis/reports/${encodeURIComponent(realm)}/${date}`),
  // text/plain 响应不走 apiClient 的 JSON 解析，直接 fetch 取原文
  fetchReportMarkdown: async (realm: string, date: string): Promise<string> => {
    const token = localStorage.getItem('acm_token');
    const url = new URL(buildUrl(`/api/ai/diagnosis/reports/${encodeURIComponent(realm)}/${date}/markdown`), window.location.origin);
    const res = await fetch(url.toString(), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.text();
  },
  exemptionsByGuids: (guids: number[]) => apiClient.get<ExemptionItem[]>(`/api/ai/diagnosis/exemptions?guids=${guids.join(',')}`),
  createExemption: (input: ExemptionInput) => apiClient.post<ExemptionItem>('/api/ai/diagnosis/exemptions', input),
  violationTypes: () => apiClient.get<string[]>('/api/ai/diagnosis/exemptions/types'),
};
