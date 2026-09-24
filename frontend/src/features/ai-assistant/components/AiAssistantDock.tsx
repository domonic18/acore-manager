import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, PanelLeft, X } from 'lucide-react';
import { useChatSessions } from '../hooks/useChatSessions';
import { useChatStream } from '../hooks/useChatStream';
import { SessionSidebar } from './SessionSidebar';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { QuestionCard } from './QuestionCard';
import { toast } from '@/shared/utils/toast.util';

// 常量与 ai-invest AssistantPanel 对齐：抽屉 520~960（默认 760），持久化宽度
const MIN_DRAWER_WIDTH = 520;
const MAX_DRAWER_WIDTH = 960;
const DEFAULT_DRAWER_WIDTH = 760;
const DRAWER_STORAGE_KEY = 'acm.ai.drawerWidth';

// 详情页「快速分析」按钮 → 侧边栏调起桥接事件（无全局 store，用 CustomEvent）
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readStoredWidth(): number {
  const raw = window.localStorage.getItem(DRAWER_STORAGE_KEY);
  const value = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(value) ? clamp(value, MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH) : DEFAULT_DRAWER_WIDTH;
}

/**
 * 全局 AI 助手入口（仿 ai-invest AssistantPanel/AssistantFab）：
 * 右下角悬浮按钮 → 右侧抽屉 [会话侧栏 | 头部 + 消息流 + 输入区]。
 * 由 app/router.tsx 在 AppLayout 同级挂载并做 GM 等级门禁。
 */
export function AiAssistantDock() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [drawerWidth, setDrawerWidth] = useState(readStoredWidth);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(drawerWidth);
  const pendingTextRef = useRef<string | null>(null);

  const { sessions, create, remove } = useChatSessions();
  const { messages, loadingHistory, streaming, pendingQuestion, send, stop } = useChatStream(activeId);

  // 详情页快速分析：打开抽屉并自动发送分析指令（复用 handleSend 的建会话/补发机制）
  const handleSendRef = useRef<(text: string) => void>(() => {});
  useEffect(() => {
    const handler = (e: Event) => {
      setOpen(true);
      const detail = (e as CustomEvent<QuickAnalyzePayload>).detail;
      if (detail) handleSendRef.current(buildQuickAnalyzePrompt(detail));
    };
    window.addEventListener(AI_QUICK_ANALYZE_EVENT, handler);
    return () => window.removeEventListener(AI_QUICK_ANALYZE_EVENT, handler);
  }, []);

  useEffect(() => {
    if (!resizing) return;
    document.body.style.cursor = 'col-resize';
    const handleMouseMove = (e: MouseEvent) => {
      // 抽屉在右侧，左边缘向左拖动（clientX 减小）时宽度增加
      setDrawerWidth(clamp(resizeStartWidthRef.current + (resizeStartXRef.current - e.clientX), MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH));
    };
    const handleMouseUp = () => {
      setResizing(false);
      setDrawerWidth((w) => {
        window.localStorage.setItem(DRAWER_STORAGE_KEY, String(w));
        return w;
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      document.body.style.cursor = '';
    };
  }, [resizing]);

  // 无活动会话时先建会话、确认新会话历史加载完成后再发出预置消息
  // （loadingHistory 首次 render 仍为过期 false，必须见过一次 true 才能判定加载完毕）
  const sawLoadingRef = useRef(false);
  useEffect(() => {
    if (loadingHistory) {
      sawLoadingRef.current = true;
      return;
    }
    if (!sawLoadingRef.current || !pendingTextRef.current) return;
    sawLoadingRef.current = false;
    const text = pendingTextRef.current;
    pendingTextRef.current = null;
    void send(text);
  }, [loadingHistory, send]);

  const activeTitle = activeId !== null ? (sessions.data ?? []).find((s) => s.id === activeId)?.title : undefined;

  const handleCreate = useCallback(async () => {
    try {
      const session = await create.mutateAsync(undefined);
      setActiveId(session.id);
      setMobileSidebarOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [create]);

  const handleSend = useCallback(
    (text: string) => {
      if (activeId !== null) {
        void send(text);
        return;
      }
      pendingTextRef.current = text;
      handleCreate().catch(() => {
        pendingTextRef.current = null;
        toast.error('创建会话失败');
      });
    },
    [activeId, send, handleCreate],
  );
  handleSendRef.current = handleSend;

  const handleDelete = useCallback(
    (id: number) => {
      remove.mutate(id, {
        onSuccess: () => {
          if (id === activeId) setActiveId(null);
        },
        onError: (e) => toast.error((e as Error).message),
      });
    },
    [remove, activeId],
  );

  return (
    <>
      <button
        type="button"
        aria-label="打开 AI 助手"
        title="AI 助手"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-6 md:right-6"
      >
        <span className="absolute inset-0 -z-10 animate-pulse rounded-full bg-primary/40" />
        <Bot className="h-6 w-6" />
      </button>

      <div className={open ? 'fixed inset-0 z-40 bg-black/40' : 'hidden'} onClick={() => setOpen(false)} />

      <div
        role="dialog"
        aria-label="AI 助手"
        className={`fixed bottom-0 right-0 top-0 z-50 flex bg-background shadow-2xl transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ width: `min(${drawerWidth}px, 100vw)` }}
      >
        <div
          role="separator"
          aria-label="调整对话框宽度"
          onMouseDown={(e) => {
            e.preventDefault();
            setResizing(true);
            resizeStartXRef.current = e.clientX;
            resizeStartWidthRef.current = drawerWidth;
          }}
          className={`absolute bottom-0 left-0 top-0 z-10 w-1.5 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/40 ${resizing ? 'bg-primary/30' : ''}`}
        />
        <div className="hidden h-full w-[240px] shrink-0 md:block">
          <SessionSidebar
            sessions={sessions.data ?? []}
            activeId={activeId}
            isLoading={sessions.isLoading}
            creating={create.isPending}
            onSelect={(id) => {
              setActiveId(id);
              setMobileSidebarOpen(false);
            }}
            onCreate={() => void handleCreate()}
            onDelete={handleDelete}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                className="rounded p-1 text-muted-foreground hover:bg-accent md:hidden"
                aria-label="会话列表"
                onClick={() => setMobileSidebarOpen((v) => !v)}
              >
                <PanelLeft className="h-4 w-4" />
              </button>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">AI 助手</div>
                <div className="max-w-[240px] truncate text-xs text-muted-foreground">{activeTitle?.trim() || '新会话'}</div>
              </div>
            </div>
            <button className="rounded p-1.5 text-muted-foreground hover:bg-accent" aria-label="关闭" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <MessageList messages={messages} loading={loadingHistory} onSuggest={handleSend} />
          {pendingQuestion && <QuestionCard payload={pendingQuestion} onSelect={(label) => void handleSend(`我选择：${label}`)} />}
          <Composer disabled={activeId === null && create.isPending} streaming={streaming} onSend={handleSend} onStop={stop} />
        </div>

        {mobileSidebarOpen && (
          <div className="absolute inset-0 z-20 bg-background md:hidden">
            <SessionSidebar
              sessions={sessions.data ?? []}
              activeId={activeId}
              isLoading={sessions.isLoading}
              creating={create.isPending}
              onSelect={(id) => {
                setActiveId(id);
                setMobileSidebarOpen(false);
              }}
              onCreate={() => void handleCreate()}
              onDelete={handleDelete}
            />
          </div>
        )}
      </div>
    </>
  );
}
