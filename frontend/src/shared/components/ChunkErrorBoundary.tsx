import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ChunkErrorBoundaryProps {
  children: ReactNode;
  /** 降级内容，默认不渲染任何东西 */
  fallback?: ReactNode;
  onError?: (error: Error) => void;
}

interface ChunkErrorBoundaryState {
  error: Error | null;
}

/**
 * 兜住懒加载 chunk 的加载失败（含其内部组件渲染期抛错），
 * 避免异常冒泡到路由根节点变成整页 "Unexpected Application Error!"。
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
    if (this.state.error) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
