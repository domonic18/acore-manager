import { redis } from '../config/redis';
import { env } from '../config/env';

export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const data = JSON.stringify(value);
    if (ttl) {
      await redis.setex(key, ttl, data);
    } else {
      await redis.set(key, data, 'EX', env.REDIS_EXPIRE_TIME);
    }
  }

  async del(key: string): Promise<void> {
    await redis.del(key);
  }

  async delPattern(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

export const cacheService = new CacheService();
