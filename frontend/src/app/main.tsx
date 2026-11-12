import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { loadRemoteDebug } from './debug-bootstrap';
import '../styles/globals.css';

loadRemoteDebug();

// 动态导入失败（chunk 404 / 网关抖动 / 网络抖动）统一在此留痕。
// 不调用 preventDefault：让异常继续冒泡到 ChunkErrorBoundary / 路由 errorElement 走降级，
// 而不是让 Vite 直接抛出无人接管的异常。
window.addEventListener('vite:preloadError', (event: Event) => {
  console.error('[chunk-load] 预加载失败', (event as Event & { payload?: unknown }).payload);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
