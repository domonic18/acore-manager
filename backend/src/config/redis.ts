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

redis.on('error', (err) => {
  // 仅记录首次连接错误，避免断线重连时刷屏
  if ((err as Error & { code?: string }).code !== 'ECONNREFUSED') {
    // NOAUTH 等认证错误需要用户检查密码配置
  }
});
