import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, PanelLeft, X } from 'lucide-react';
import { useChatSessions } from '../hooks/useChatSessions';
import { useChatStream } from '../hooks/useChatStream';
import { SessionSidebar } from './SessionSidebar';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { toast } from '@/shared/utils/toast.util';

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
  const { messages, loadingHistory, streaming, send, stop } = useChatStream(activeId);

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
