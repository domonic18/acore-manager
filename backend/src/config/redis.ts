import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { env } from './env';

const redisOptions: RedisOptions = {
  connectTimeout: 5000,
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
};

export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, redisOptions)
  : new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      ...redisOptions,
    });

redis.on('error', (_err) => {
  // 静默处理连接错误，由调用方决定是否需要重试
});
