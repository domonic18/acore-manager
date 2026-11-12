import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { requestLogger } from './middleware/request-logger';
import { responseFormatter } from './middleware/response-formatter';
import { errorHandler } from './middleware/error-handler';
import authRoutes from './routes/auth.routes';
import accountRoutes from './routes/account.routes';
import characterRoutes from './routes/character.routes';
import itemRoutes from './routes/item.routes';
import transactionRoutes from './routes/transaction.routes';
import gmToolRoutes from './routes/gm-tool.routes';
import auditLogRoutes from './routes/audit-log.routes';
import dashboardRoutes from './routes/dashboard.routes';
import healthRoutes from './routes/health.routes';
import ipBanRoutes from './routes/ip-ban.routes';
import banlistRoutes from './routes/banlist.routes';
import muteRoutes from './routes/mute.routes';
import rbacRoutes from './routes/rbac.routes';
import systemConfigRoutes from './routes/system-config.routes';
import aiModelConfigRoutes from './routes/ai-model-config.routes';
import aiTokenUsageRoutes from './routes/ai-token-usage.routes';
import aiDiagnosisRoutes from './routes/ai-diagnosis.routes';
import aiAssistantRoutes from './routes/ai-assistant.routes';
import aiAnalysisRoutes from './routes/ai-analysis.routes';
import aiPromptRoutes from './routes/ai-prompt.routes';
import aiWatchlistRoutes from './routes/ai-watchlist.routes';
import feishuBindingRoutes from './routes/feishu-binding.routes';
import iconRoutes from './routes/icon.routes';
import { dbReadinessGate } from './middleware/db-readiness-gate';

// Vite 构建产物文件名形如 index-CejDb8xH.js / index-BteZ8KxJ.css，8 位哈希后缀
const HASHED_ASSET_RE = /-[A-Za-z0-9_-]{8}\.(js|mjs|css|woff2?|ttf|eot|png|jpe?g|gif|svg|webp|avif|ico)$/i;
// 带静态扩展名的请求路径：未命中时按 404 处理，不走 SPA fallback
const STATIC_PATH_RE = /\.(js|mjs|css|map|json|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|mp4|webm)$/i;

export function createApp(): Application {
  const app = express();

  // 飞书工作台免登需加载外域 h5-js-sdk（bytegoofy CDN，响应无 CORP 头）：
  // CSP 放行其 script-src 与授权页 frame-src；关闭 COEP（默认 require-corp 会拦无 CORP 的跨域脚本）
  // lf-package-cn.feishucdn.com 为飞书官方远程调试脚本（前端 ?debug=1 时加载）
  // unsafe-eval：h5sdk 顶层用 new Function("return this") 取全局对象，缺它会抛未捕获 EvalError
  // 中断 SDK 初始化，免登桥接全程静默（即此前免登超时根因）
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          scriptSrc: [
            "'self'",
            "'unsafe-eval'",
            'https://lf1-cdn-tos.bytegoofy.com',
            'https://lf-package-cn.feishucdn.com',
          ],
          frameSrc: ["'self'", 'https://*.feishu.cn'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : [];
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, origin || '*');
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(requestLogger);
  app.use(responseFormatter);

  // API 就绪门禁：初始化中有限等待、降级快速失败（503 + code + Retry-After），不影响静态资源与健康端点
  app.use('/api', dbReadinessGate);

  app.use('/api/auth', authRoutes);
  app.use('/api/accounts', accountRoutes);
  app.use('/api/characters', characterRoutes);
  app.use('/api/items', itemRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/gm', gmToolRoutes);
  app.use('/api/ip-bans', ipBanRoutes);
  app.use('/api/banlist', banlistRoutes);
  app.use('/api/mutes', muteRoutes);
  app.use('/api/audit', auditLogRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/rbac', rbacRoutes);
  app.use('/api/system-config', systemConfigRoutes);
  app.use('/api/feishu-bindings', feishuBindingRoutes);
  app.use('/api/ai/model-configs', aiModelConfigRoutes);
  app.use('/api/ai/token-usage', aiTokenUsageRoutes);
  app.use('/api/ai/diagnosis', aiDiagnosisRoutes);
  app.use('/api/ai/watchlist', aiWatchlistRoutes);
  app.use('/api/ai/assistant', aiAssistantRoutes);
  app.use('/api/ai/analysis', aiAnalysisRoutes);
  app.use('/api/ai/prompts', aiPromptRoutes);
  app.use('/api/health', healthRoutes);
  // 图标代理不鉴权：<img> 标签无法携带 Authorization 头，仅作 CDN 回源
  app.use('/api/icons', iconRoutes);

  const publicPath = path.join(__dirname, 'public');
  // 带内容哈希的构建产物可长期强缓存：文件名随内容变化，命中缓存必然是对应版本
  // index.html 必须每次回源校验，否则发新版后用户仍拿着旧壳引用已下线的 chunk（chunk 404 → 动态导入失败）
  // 非哈希的 public 资源（logo.svg、assets/icons/**）只给短缓存，避免同名文件更新后用户拿不到新内容
  app.use(
    express.static(publicPath, {
      index: false,
      setHeaders: (res, filePath) => {
        const name = path.basename(filePath);
        if (name === 'index.html') {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (HASHED_ASSET_RE.test(name)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      },
    }),
  );

  // SPA fallback：静态资源未命中必须回 404，不能回 index.html
  // 否则浏览器把 text/html 当 JS 解析，真实 404 被伪装成 "Failed to fetch dynamically imported module"，无从定位
  app.get('*', (req, res) => {
    if (STATIC_PATH_RE.test(req.path)) {
      res.status(404).type('text/plain').send('Not Found');
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.use(errorHandler);

  return app;
}
