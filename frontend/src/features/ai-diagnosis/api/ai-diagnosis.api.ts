import { apiClient } from '@/shared/api/client';

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

export const aiDiagnosisApi = {
  reports: (realm?: string) =>
    apiClient.get<AiReportSummary[]>(`/api/ai/diagnosis/reports${realm ? `?realm=${encodeURIComponent(realm)}` : ''}`),
  report: (realm: string, date: string) =>
    apiClient.get<AiReportDetail>(`/api/ai/diagnosis/reports/${encodeURIComponent(realm)}/${date}`),
  uploadStatus: (realm: string, days = 7) =>
    apiClient.get<UploadStatusDay[]>(`/api/ai/diagnosis/upload-status?realm=${encodeURIComponent(realm)}&days=${days}`),
  removeReport: (realm: string, date: string) =>
    apiClient.del<{ success: boolean }>(`/api/ai/diagnosis/reports/${encodeURIComponent(realm)}/${date}`),
};
