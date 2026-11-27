import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Bot } from 'lucide-react';
import { ChunkErrorBoundary } from '@/shared/components/ChunkErrorBoundary';
import { LoadFailureNotice } from '@/shared/components/LoadFailureNotice';
import { isChunkLoadError, lazyWithRetry } from '@/shared/lib/chunk-load';
import { AI_QUICK_ANALYZE_EVENT, type QuickAnalyzePayload, type QuickAnalyzeRequest } from '@/shared/lib/ai-quick-analyze';

// 助手抽屉按需加载：每页都挂载助手会把 dock chunk 与 157KB 的 markdown 栈塞进首屏
// 关键路径，移动端带宽有限时这正是 chunk 加载失败（“助手不可用”）的主因。
// 本组件自身静态引入（落在入口 chunk），常驻但零额外请求。
export function AiAssistantLauncher() {
  const [open, setOpen] = useState(false);
  const [quickAnalyze, setQuickAnalyze] = useState<QuickAnalyzeRequest | null>(null);
  // 每次重试递增：key 变化整树重建（边界 + 全新 lazy 实例）——React.lazy 会缓存
  // rejected promise（react#14254），只重置边界状态无法重新发起 import()
  const [attempt, setAttempt] = useState(0);

  // 详情页「快速分析」：事件可能早于抽屉挂载，统一在常驻层接收并转交
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<QuickAnalyzePayload>).detail;
      if (!detail) return;
      setQuickAnalyze((prev) => ({ payload: detail, nonce: (prev?.nonce ?? 0) + 1 }));
      setOpen(true);
    };
    window.addEventListener(AI_QUICK_ANALYZE_EVENT, handler);
    return () => window.removeEventListener(AI_QUICK_ANALYZE_EVENT, handler);
  }, []);

  // 桌面端悬停/聚焦即预取抽屉与 markdown 栈，点击时秒开；移动端点击后走骨架屏
  const prefetch = useCallback(() => {
    void import('./AiAssistantDrawer').catch(() => {});
    void import('./MessageList').catch(() => {});
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="打开 AI 助手"
        title="AI 助手"
        onClick={() => setOpen(true)}
        onMouseEnter={prefetch}
        onFocus={prefetch}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-6 md:right-6"
      >
        <span className="absolute inset-0 -z-10 animate-pulse rounded-full bg-primary/40" />
        <Bot className="h-6 w-6" />
      </button>

      {open && (
        <DrawerGate
          key={attempt}
          onClose={() => setOpen(false)}
          quickAnalyze={quickAnalyze}
          onRetry={() => setAttempt((a) => a + 1)}
        />
      )}
    </>
  );
}

function DrawerGate({
  onClose,
  quickAnalyze,
  onRetry,
}: {
  onClose: () => void;
  quickAnalyze: QuickAnalyzeRequest | null;
  onRetry: () => void;
}) {
  const DrawerLazy = useMemo(
    () =>
      lazyWithRetry(
        async () => {
          const m = await import('./AiAssistantDrawer');
          return { default: m.AiAssistantDrawer };
        },
        'AiAssistantDrawer',
      ),
    [],
  );
  // 助手 chunk 加载失败只降级为角标提示，不牵连整页；文案按加载失败/运行异常区分
  return (
    <ChunkErrorBoundary
      fallback={(error) => (
        <LoadFailureNotice
          floating
          title="AI 助手加载失败"
          description={
            isChunkLoadError(error)
              ? '网络波动导致助手脚本未加载完成，可重试加载。'
              : '助手组件运行异常，可尝试重新加载。'
          }
          onRetry={onRetry}
        />
      )}
    >
      <Suspense fallback={null}>
        <DrawerLazy onClose={onClose} quickAnalyze={quickAnalyze} />
      </Suspense>
    </ChunkErrorBoundary>
  );
}
