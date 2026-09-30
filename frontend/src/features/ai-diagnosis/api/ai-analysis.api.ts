import { apiClient } from '@/shared/api/client';

// 定向分析前端 API（异步化改造）：POST 批量建行并触发 manager-job 执行，
// 页面通过列表/详情轮询获取状态与结论；REST 走历史列表/详情/处置。

export type TargetedSubjectType = 'character' | 'account';

export interface TargetedAnalysisInput {
  realm: string;
  subjectType: TargetedSubjectType;
  subjectNames: string[];
  timeFrom: string;
  timeTo: string;
  banContext?: { date?: string; reason?: string; bannedBy?: string };
}

export interface AnalysisViolation {
  type: string;
  count: number;
  confirmed: boolean;
  note?: string;
}

export type AnalysisSuggestion = 'maintain' | 'lift' | 'downgrade' | 'manual_review';

export interface AnalysisConclusion {
  subjectType: string;
  subjectName: string;
  timeRange: { from: string; to: string };
  violations: AnalysisViolation[];
  falsePositiveSignals: string[];
  evidence: { source: string; quote: string }[];
  suggestion: AnalysisSuggestion;
  suggestionReason: string;
  markdown?: string;
}

export interface TargetedAnalysisSummary {
  id: number;
  realm: string;
  subjectType: string;
  subjectName: string;
  timeFrom: string;
  timeTo: string;
  status: string;
  triggeredBy: string;
  gmRemark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TargetedAnalysisDetail extends TargetedAnalysisSummary {
  conclusionJson: AnalysisConclusion | { error: string } | null;
  conclusionMarkdown: string | null;
  tokenUsage: { prompt?: number; completion?: number; total?: number } | null;
}

export const aiAnalysisApi = {
  create: (input: TargetedAnalysisInput) => apiClient.post<TargetedAnalysisSummary[]>('/api/ai/analysis/targeted', input),
  list: (page = 1, subjectName?: string) =>
    apiClient.get<TargetedAnalysisSummary[]>(
      `/api/ai/analysis/targeted?page=${page}${subjectName ? `&subjectName=${encodeURIComponent(subjectName)}` : ''}`,
    ),
  detail: (id: number) => apiClient.get<TargetedAnalysisDetail>(`/api/ai/analysis/targeted/${id}`),
  // 处置备注 / Markdown 润色与删除（T4.7，gm3）
  update: (id: number, patch: { gmRemark?: string; conclusionMarkdown?: string }) =>
    apiClient.put<TargetedAnalysisDetail>(`/api/ai/analysis/targeted/${id}`, patch),
  remove: (id: number) => apiClient.del<{ success: boolean }>(`/api/ai/analysis/targeted/${id}`),
};
