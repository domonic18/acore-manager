/**
 * 应用版本号 — 由 vite.config.ts 从项目根目录 VERSION 文件注入
 */

export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION || "0.1.0";

export const SHORT_VERSION: string = `v${APP_VERSION.split(".").slice(0, 4).join(".")}`;
