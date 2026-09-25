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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function start() {
  try {
    await redis.connect();
    logger.info('Redis connection established / Redis 连接已建立');
  } catch (err) {
    logger.warn(err, 'Redis unavailable at startup, running in degraded mode / Redis 启动时不可用，将以降级模式运行');
  }

  // 监听前先等数据库初始化：SCF 平台会持有冷启动请求直到端口可连，常见路径的 503 竞态就此消失；
  // 预算耗尽（DB 真不可达）仍照常监听，转 degraded，由无限重试循环等待自愈
  const init = initializeDataSourcesWithRetry();
  await Promise.race([init, delay(env.STARTUP_DB_BUDGET_MS)]);

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server listening on port ${PORT} (state=${getServiceState()}) / 服务器监听端口 ${PORT}`);
  });

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
