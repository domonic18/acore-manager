import { apiClient, buildUrl } from '@/shared/api/client';

// 定向分析前端 API（T4.6）：SSE 流式消费镜像 ai-assistant streamChat（arch 5.2 帧协议），
// REST 部分走历史列表/详情。事件无 question——analysis 场景提示词已禁止 ask_user。

export type TargetedSubjectType = 'character' | 'account';

export interface TargetedAnalysisInput {
  realm: string;
  subjectType: TargetedSubjectType;
  subjectName: string;
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

export interface ToolCallEvent {
  name: string;
  args?: unknown;
}

export interface ToolResultEvent {
  name: string;
  rowCount: number | null;
  durationMs: number | null;
  error?: string | null;
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onToolCall: (data: ToolCallEvent) => void;
  onToolResult: (data: ToolResultEvent) => void;
  onStep?: (data: { todos?: unknown[] }) => void;
  onDone: (data: { analysisId: number; conclusion: AnalysisConclusion; tokens: { total: number } }) => void;
  onError: (data: { message: string; code?: string; analysisId?: number }) => void;
}

export async function streamTargetedAnalysis(input: TargetedAnalysisInput, h: StreamHandlers, signal?: AbortSignal): Promise<void> {
  const token = localStorage.getItem('acm_token');
  const res = await fetch(buildUrl('/api/ai/analysis/targeted'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      // 非 JSON 错误体，保留 HTTP 状态信息
    }
    h.onError({ message: msg, code: String(res.status) });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx = buf.indexOf('\n\n');
    while (idx >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      emitFrame(frame, h);
      idx = buf.indexOf('\n\n');
    }
  }
}

function emitFrame(frame: string, h: StreamHandlers): void {
  const event = /^event: (.*)$/m.exec(frame)?.[1]?.trim() ?? 'message';
  const dataLine = /^data: (.*)$/m.exec(frame)?.[1];
  if (!dataLine) return;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataLine);
  } catch {
    return;
  }
  switch (event) {
    case 'delta':
      h.onDelta(String(data.text ?? ''));
      break;
    case 'tool_call':
      h.onToolCall(data as unknown as ToolCallEvent);
      break;
    case 'tool_result':
      h.onToolResult(data as unknown as ToolResultEvent);
      break;
    case 'step':
      h.onStep?.(data as { todos?: unknown[] });
      break;
    case 'done':
      h.onDone(data as unknown as { analysisId: number; conclusion: AnalysisConclusion; tokens: { total: number } });
      break;
    case 'error':
      h.onError(data as unknown as { message: string; code?: string; analysisId?: number });
      break;
  }
}

export const aiAnalysisApi = {
  list: (page = 1, subjectName?: string) =>
    apiClient.get<TargetedAnalysisSummary[]>(
      `/api/ai/analysis/targeted?page=${page}${subjectName ? `&subjectName=${encodeURIComponent(subjectName)}` : ''}`,
    ),
  detail: (id: number) => apiClient.get<TargetedAnalysisDetail>(`/api/ai/analysis/targeted/${id}`),
};
