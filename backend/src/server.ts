import 'reflect-metadata';
import '@/config/load-env';
import { createApp } from './app';
import {
  acmDataSource,
  authDataSource,
  charactersDataSource,
  getServiceState,
  initializeDataSourcesWithRetry,
  worldDataSource,
} from './config/database';
import { redis } from './config/redis';
import { env } from './config/env';
import { logger } from './middleware/request-logger';

const PORT = env.PORT;

const app = createApp();

async function shutdown(server: import('http').Server): Promise<void> {
  logger.info('Shutdown signal received, draining connections / 收到停机信号，正在排水连接');
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([
    authDataSource.destroy(),
    charactersDataSource.destroy(),
    worldDataSource.destroy(),
    acmDataSource.destroy(),
    redis.quit(),
  ]);
  process.exit(0);
}

async function initDependencies(): Promise<void> {
  const startedAt = Date.now();
  try {
    await redis.connect();
    logger.info('Redis connection established / Redis 连接已建立');
  } catch (err) {
    logger.warn(err, 'Redis unavailable at startup, running in degraded mode / Redis 启动时不可用，将以降级模式运行');
  }

  // initializeDataSourcesWithRetry 内部无限重试不会 reject；兜底防御后台任务异常逃逸成 unhandled rejection
  try {
    await initializeDataSourcesWithRetry();
    logger.info(`Startup dependencies initialized in ${Date.now() - startedAt}ms / 启动依赖初始化完成`);
  } catch (err) {
    logger.error(err, 'Database initialization exited unexpectedly / 数据库初始化意外退出');
  }
}

async function start() {
  // 端口先绑定：SCF 以“端口可连”为实例可服务信号，静态资源不依赖 DB，初始化期间即可服务；
  // /api 由 db-readiness-gate 兜底（等待初始化完成，超预算返回 503 + Retry-After），鉴权链路不变
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server listening on port ${PORT} (state=${getServiceState()}) / 服务器监听端口 ${PORT}`);
  });

  void initDependencies();

  let shuttingDown = false;
  const handleSignal = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void shutdown(server);
  };
  process.on('SIGTERM', handleSignal);
  process.on('SIGINT', handleSignal);
}

start();
