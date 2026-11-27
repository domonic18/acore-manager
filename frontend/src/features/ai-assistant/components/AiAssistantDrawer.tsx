import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Bot, PanelLeft, X } from 'lucide-react';
import { useChatSessions } from '../hooks/useChatSessions';
import { useChatStream } from '../hooks/useChatStream';
import { SessionSidebar } from './SessionSidebar';
import { Composer } from './Composer';
import { QuestionCard } from './QuestionCard';
import { lazyWithRetry } from '@/shared/lib/chunk-load';
import type { MessageListProps } from './MessageList';
import { toast } from '@/shared/utils/toast.util';
import { buildQuickAnalyzePrompt, type QuickAnalyzeRequest } from '@/shared/lib/ai-quick-analyze';

// markdown 渲染栈（react-markdown/remark-gfm 共享 chunk ~157KB）仅在消息区使用：
// 抽屉本身按需加载，消息区再单独懒加载；失败只降级消息区，抽屉壳不受影响
const MessageList = lazyWithRetry<MessageListProps>(
  async () => {
    const m = await import('./MessageList');
    return { default: m.MessageList };
  },
  'AiAssistantMessageList',
);

interface AiAssistantDrawerProps {
  onClose: () => void;
  /** 详情页「快速分析」请求；由常驻的 Launcher 接收事件后转交 */
  quickAnalyze: QuickAnalyzeRequest | null;
}

// 常量与 ai-invest AssistantPanel 对齐：抽屉 520~960（默认 760），持久化宽度
const MIN_DRAWER_WIDTH = 520;
const MAX_DRAWER_WIDTH = 960;
const DEFAULT_DRAWER_WIDTH = 760;
const DRAWER_STORAGE_KEY = 'acm.ai.drawerWidth';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readStoredWidth(): number {
  const raw = window.localStorage.getItem(DRAWER_STORAGE_KEY);
  const value = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(value) ? clamp(value, MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH) : DEFAULT_DRAWER_WIDTH;
}

/**
 * AI 助手抽屉（右侧消息流 + 输入区）。
 * 由 AiAssistantLauncher 按需挂载：助手 chunk 与 markdown 栈不进页面首屏关键路径。
 */
export function AiAssistantDrawer({ onClose, quickAnalyze }: AiAssistantDrawerProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [drawerWidth, setDrawerWidth] = useState(readStoredWidth);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(drawerWidth);
  const pendingTextRef = useRef<string | null>(null);
  // 挂载后再滑入，保留原来的 200ms 位移动画（挂载即显示会没有过渡）
  const [entered, setEntered] = useState(false);

  const { sessions, create, remove } = useChatSessions();
  const { messages, loadingHistory, streaming, pendingQuestion, send, stop } = useChatStream(activeId);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
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
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
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

  // 详情页快速分析：nonce 变化即视为新请求（抽屉未打开时随挂载补发，已打开时再次触发）
  const handleSendRef = useRef<(text: string) => void>(() => {});
  handleSendRef.current = handleSend;
  const handledNonceRef = useRef(0);
  useEffect(() => {
    if (!quickAnalyze || quickAnalyze.nonce === handledNonceRef.current) return;
    handledNonceRef.current = quickAnalyze.nonce;
    handleSendRef.current(buildQuickAnalyzePrompt(quickAnalyze.payload));
  }, [quickAnalyze]);

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
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <div
        role="dialog"
        aria-label="AI 助手"
        className={`fixed bottom-0 right-0 top-0 z-50 flex bg-background shadow-2xl transition-transform duration-200 ${entered ? 'translate-x-0' : 'translate-x-full'}`}
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
            <button className="rounded p-1.5 text-muted-foreground hover:bg-accent" aria-label="关闭" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 消息区含 markdown 渲染栈（懒加载 chunk）：加载期间骨架占位，输入区/问题卡不受影响 */}
          <Suspense
            fallback={
              <div className="flex-1 animate-pulse px-4 py-4" aria-busy="true" aria-label="正在加载助手组件">
                <div className="mb-3 h-9 w-36 rounded-2xl rounded-br-sm bg-muted" />
                <div className="flex gap-3">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-muted" />
                  <div className="space-y-2">
                    <div className="h-4 w-56 rounded bg-muted/70" />
                    <div className="h-4 w-40 rounded bg-muted/70" />
                  </div>
                </div>
              </div>
            }
          >
            <MessageList messages={messages} loading={loadingHistory} onSuggest={handleSend} />
          </Suspense>
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
