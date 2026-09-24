import { apiClient, buildUrl } from '@/shared/api/client';

export interface ChatSession {
  id: number;
  userId: number;
  threadId: string;
  title: string;
  realm: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface ChatHistoryMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  toolName: string | null;
  tokens: number | null;
  createdAt: string;
}

export const aiAssistantApi = {
  listSessions: () => apiClient.get<ChatSession[]>('/api/ai/assistant/sessions'),
  createSession: (title = '') => apiClient.post<ChatSession>('/api/ai/assistant/sessions', { title }),
  deleteSession: (id: number) => apiClient.del<{ success: boolean }>(`/api/ai/assistant/sessions/${id}`),
  messages: (id: number) => apiClient.get<ChatHistoryMessage[]>(`/api/ai/assistant/sessions/${id}/messages`),
};

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

export interface DoneEvent {
  sessionId: number;
  messageId: number | null;
  tokens: { prompt: number; completion: number; total: number };
}

export interface ErrorEvent {
  message: string;
  code?: string;
}

export interface QuestionEvent {
  question: string;
  options: { value: string; label: string }[];
  default?: string | null;
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onToolCall: (data: ToolCallEvent) => void;
  onToolResult: (data: ToolResultEvent) => void;
  onStep?: (data: { todos?: unknown[] }) => void;
  onQuestion?: (data: QuestionEvent) => void;
  onDone: (data: DoneEvent) => void;
  onError: (data: ErrorEvent) => void;
}

// SSE 消费（arch 5.2 事件协议）：POST fetch → ReadableStream 增量解析 `event:/data:` 帧。
// 服务端 Accept 协商：显式带 text/event-stream 才走流式，否则整段 JSON 返回。
export async function streamChat(sessionId: number, message: string, h: StreamHandlers, signal?: AbortSignal): Promise<void> {
  const token = localStorage.getItem('acm_token');
  const res = await fetch(buildUrl('/api/ai/assistant/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ sessionId, message }),
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
    case 'question':
      h.onQuestion?.(data as unknown as QuestionEvent);
      break;
    case 'done':
      h.onDone(data as unknown as DoneEvent);
      break;
    case 'error':
      h.onError(data as unknown as ErrorEvent);
      break;
  }
}
