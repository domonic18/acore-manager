import Redis from 'ioredis';
import { env } from './env';

export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL)
  : new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
    });

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});
