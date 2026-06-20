import 'reflect-metadata';
import 'dotenv/config';
import { createApp } from './app';
import { initializeDataSourcesWithRetry } from './config/database';
import { redis } from './config/redis';
import { env } from './config/env';
import { logger } from './middleware/request-logger';

const PORT = env.PORT;

const app = createApp();

async function start() {
  try {
    await redis.connect();
    logger.info('Redis connection established / Redis 连接已建立');
  } catch (err) {
    logger.warn(err, 'Redis unavailable at startup, running in degraded mode / Redis 启动时不可用，将以降级模式运行');
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server listening on port ${PORT} / 服务器监听端口 ${PORT}`);
  });

  // 后台异步连接数据库，失败不阻塞服务启动
  initializeDataSourcesWithRetry().catch((err) => {
    logger.error(err, 'Background database initialization failed / 后台数据库初始化失败');
  });
}

start();
