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

    await redis.ping();
    logger.info('Redis connection established');

    const app = createApp();

    app.listen(env.PORT, () => {
      logger.info(`Server listening on port ${env.PORT}`);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

bootstrap();
