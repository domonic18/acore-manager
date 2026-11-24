import { Component, type ErrorInfo, type ReactNode } from 'react';

type FallbackRender = (error: Error) => ReactNode;

interface ChunkErrorBoundaryProps {
  children: ReactNode;
  /** 降级内容；传函数时可按捕获的错误动态渲染（如区分加载失败/运行异常），缺省不渲染任何东西 */
  fallback?: ReactNode | FallbackRender;
  onError?: (error: Error) => void;
}

interface ChunkErrorBoundaryState {
  error: Error | null;
}

/**
 * 兜住懒加载 chunk 的加载失败（含其内部组件渲染期抛错），
 * 避免异常冒泡到路由根节点变成整页 "Unexpected Application Error!"。
 * 重试由调用方通过 key 变化重建本边界与子树完成——React.lazy 会缓存
 * rejected promise（react#14254），仅重置边界状态无法重新发起加载。
 */
export class ChunkErrorBoundary extends Component<ChunkErrorBoundaryProps, ChunkErrorBoundaryState> {
  state: ChunkErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ChunkErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error);
    console.error('[chunk-error] 子树渲染失败，已降级', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') return fallback(error);
      return fallback ?? null;
    }
    return this.props.children;
  }
}
