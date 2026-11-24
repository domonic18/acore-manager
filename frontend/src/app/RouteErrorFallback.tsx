import { useRouteError } from 'react-router-dom';
import { LoadFailureNotice } from '@/shared/components/LoadFailureNotice';
import { isChunkLoadError } from '@/shared/lib/chunk-load';

/**
 * 路由级错误兜底：页面 chunk 加载失败时只在内容区展示提示与重试入口，
 * 侧边栏等布局保留，不再整页变成 "Unexpected Application Error!"。
 * 非加载类错误不向用户渲染原始错误文本（可能含内部路径等敏感信息），仅落 console。
 */
export function RouteErrorFallback() {
  const error = useRouteError();
  const chunkFailure = isChunkLoadError(error);

  if (!chunkFailure) {
    console.error('[route-error] 页面渲染异常', error);
  }

  return (
    <LoadFailureNotice
      title={chunkFailure ? '页面资源加载失败' : '页面加载出错'}
      description={
        chunkFailure
          ? '网络波动导致页面脚本未能加载完成，可点击下方按钮重新加载。'
          : '页面渲染出现异常，可点击下方按钮重新加载。'
      }
    />
  );
}
