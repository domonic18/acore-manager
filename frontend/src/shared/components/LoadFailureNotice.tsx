import { AlertTriangle } from 'lucide-react';

interface LoadFailureNoticeProps {
  title?: string;
  description?: string;
  /** 悬浮定位（AI 助手入口这类挂在页面角落的控件） */
  floating?: boolean;
}

/**
 * chunk 加载失败时的降级提示：给出可点击的重新加载入口，
 * 取代 React Router 默认的整页 "Unexpected Application Error!"。
 */
export function LoadFailureNotice({
  title = '资源加载失败',
  description = '页面脚本未能加载完成，可点击下方按钮重新加载。',
  floating = false,
}: LoadFailureNoticeProps) {
  return (
    <div
      className={
        floating
          ? 'fixed bottom-20 right-4 z-40 flex max-w-xs flex-col gap-2 rounded-lg border border-border bg-background p-3 text-sm shadow-lg md:bottom-6 md:right-6'
          : 'flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center'
      }
    >
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        {title}
      </div>
      <p className="text-muted-foreground">{description}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="w-fit rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        重新加载
      </button>
    </div>
  );
}
