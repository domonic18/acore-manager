// 外部资源地址（物品图标 / aowow 数据库外链）
// 图标默认走后端代理 /api/icons（上游由后端 ICON_UPSTREAMS 配置，本机优先 acore-resources、
// wowhead CDN 兜底）；浏览器直连 CDN 仅作前端侧最后回退
export const ICON_BASE_URL = import.meta.env.VITE_ICON_BASE_URL || '/api/icons';
export const ICON_FALLBACK_URL = 'https://wow.zamimg.com/images/wow/icons/medium';
export const AOWOW_BASE_URL = import.meta.env.VITE_AOWOW_BASE_URL || 'https://wowgaming.altervista.org/aowow';
