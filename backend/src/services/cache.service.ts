import { redis } from '../config/redis';
import { env } from '../config/env';

export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    try {
      const data = JSON.stringify(value);
      if (ttl) {
        await redis.setex(key, ttl, data);
      } else {
        await redis.set(key, data, 'EX', env.REDIS_EXPIRE_TIME);
      }
    } catch {
      // Redis unavailable — silently skip caching
    }
  }

  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch {
      // Redis unavailable — silently skip
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // Redis unavailable — silently skip
    }
  }
}

export const cacheService = new CacheService();
