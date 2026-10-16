// 飞书官方远程调试代理（Inspect），仅 ?debug=1 时加载：飞书内开启调试模式后可在桌面 Chrome
// chrome://inspect 连接页面。放 head 处由 CSP 管控，域名须在 app.ts scriptSrc 白名单内。
const REMOTE_DEBUG_URL =
  'https://lf-package-cn.feishucdn.com/obj/feishu-static/op/fe/devtools_frontend/remote-debug-0.0.1-alpha.6.js';

export function loadRemoteDebug(): void {
  if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
  const script = document.createElement('script');
  script.src = REMOTE_DEBUG_URL;
  document.head.appendChild(script);
}
