import 'reflect-metadata';
import { createApp } from './app';
import { initializeDataSources } from './config/database';
import { redis } from './config/redis';
import { env } from './config/env';
import { logger } from './middleware/request-logger';

async function bootstrap() {
  try {
    await initializeDataSources();
    logger.info('Database connections established');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to database');
    process.exit(1);
  }

  // Redis 连接改为异步非阻塞，避免 SCF 初始化超时
  redis.ping().then(() => {
    logger.info('Redis connection established');
  }).catch((error) => {
    logger.error({ error }, 'Redis connection failed, will retry on demand');
  });

  const app = createApp();

  app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`Server listening on port ${env.PORT}`);
  });
}

bootstrap();
