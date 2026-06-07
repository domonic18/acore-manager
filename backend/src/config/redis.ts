import Redis from 'ioredis';
import { env, redisConn } from './env';

const redis = new Redis({
  host: redisConn.host,
  port: redisConn.port,
  password: redisConn.password || undefined,
  db: redisConn.db,
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
});

redis.on('error', (err) => {
  // Silently ignore connection errors in production (e.g. SCF without Redis)
  if (env.NODE_ENV === 'development') {
    console.error('Redis connection error / Redis 连接错误:', err.message);
  }
});

export { redis };
