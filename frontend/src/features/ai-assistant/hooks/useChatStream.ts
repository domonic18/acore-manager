import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { aiAssistantApi, streamChat, ToolCallEvent, ToolResultEvent } from '../api/ai-assistant.api';

export interface ChatUiTool {
  name: string;
  args?: unknown;
  rowCount?: number | null;
  durationMs?: number | null;
  status: 'running' | 'done';
}

export interface ChatUiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools: ChatUiTool[];
  streaming?: boolean;
  error?: string;
}

type Updater = (m: ChatUiMessage) => ChatUiMessage;

// 单会话消息流：会话切换加载正本历史；发送经 SSE 增量更新最后一条 assistant 气泡。
export function useChatStream(sessionId: number | null) {
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const queryClient = useQueryClient();
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMessages([]);
    if (sessionId === null) return;
    let cancelled = false;
    setLoadingHistory(true);
    aiAssistantApi
      .messages(sessionId)
      .then((rows) => {
        if (cancelled) return;
        const history = rows.map((r) => ({
          id: `m-${r.id}`,
          role: r.role,
          content: r.content,
          tools: r.toolName ? [{ name: r.toolName, status: 'done' as const }] : [],
        }));
        // 历史晚于乐观轮次返回时（发消息触发建会话/快速切会话）不得清空在途消息
        setMessages((prev) =>
          streamingRef.current && prev.length > 0 ? [...history, ...prev] : history,
        );
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const patchLast = useCallback((updater: Updater) => {
    setMessages((prev) => {
      if (prev.length === 0 || prev[prev.length - 1].role !== 'assistant') return prev;
      return [...prev.slice(0, -1), updater(prev[prev.length - 1])];
    });
  }, []);

  const patchTool = useCallback(
    (name: string, patch: Partial<ChatUiTool>) => {
      patchLast((m) => ({
        ...m,
        tools: m.tools.map((t) => (t.name === name && t.status === 'running' ? { ...t, ...patch, status: 'done' as const } : t)),
      }));
    },
    [patchLast],
  );

  const send = useCallback(
    async (text: string) => {
      if (sessionId === null || streamingRef.current || !text.trim()) return;
      streamingRef.current = true;
      setStreaming(true);
      const stamp = Date.now();
      setMessages((prev) => [
        ...prev,
        { id: `u-${stamp}`, role: 'user', content: text, tools: [] },
        { id: `a-${stamp}`, role: 'assistant', content: '', tools: [], streaming: true },
      ]);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await streamChat(
          sessionId,
          text,
          {
            onDelta: (t) => patchLast((m) => ({ ...m, content: m.content + t })),
            onToolCall: (d: ToolCallEvent) =>
              patchLast((m) => ({ ...m, tools: [...m.tools, { name: d.name, args: d.args, status: 'running' as const }] })),
            onToolResult: (d: ToolResultEvent) => patchTool(d.name, { rowCount: d.rowCount, durationMs: d.durationMs }),
            onDone: () => patchLast((m) => ({ ...m, streaming: false })),
            onError: (d) => patchLast((m) => ({ ...m, streaming: false, error: d.message })),
          },
          controller.signal,
        );
      } catch (err) {
        const e = err as Error;
        if (e.name !== 'AbortError') patchLast((m) => ({ ...m, streaming: false, error: e.message }));
      } finally {
        patchLast((m) => ({ ...m, streaming: false }));
        abortRef.current = null;
        streamingRef.current = false;
        setStreaming(false);
        void queryClient.invalidateQueries({ queryKey: ['ai-chat-sessions'] });
      }
    },
    [sessionId, patchLast, patchTool, queryClient],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, loadingHistory, streaming, send, stop };
}
