import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

interface MysqlConn {
  host: string;
  port: number;
  user: string;
  pass: string;
}

function parseMysqlUrl(url?: string): MysqlConn {
  if (!url) throw new Error('Missing required environment variable: DB_URL');
  const m = url.match(/^mysql:\/\/([^:]+):([^@]+)@([^:]+)(?::(\d+))?\/?$/i);
  if (!m) throw new Error(`Invalid DB_URL format: ${url}`);
  return {
    user: decodeURIComponent(m[1]),
    pass: decodeURIComponent(m[2]),
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 3306,
  };
}

interface RedisConn {
  host: string;
  port: number;
  password: string;
  db: number;
}

function parseRedisUrl(url?: string): RedisConn {
  if (!url) throw new Error('Missing required environment variable: REDIS_URL');
  // 支持格式: redis://host, redis://:password@host, redis://username:password@host
  const m = url.match(/^redis:\/\/(?:(?:([^:@]*):)?([^@]*)@)?([^:/]+)(?::(\d+))?(?:\/(\d+))?\/?$/i);
  if (!m) throw new Error(`Invalid REDIS_URL format: ${url}`);
  return {
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 6379,
    password: m[2] ? decodeURIComponent(m[2]) : '',
    db: m[5] ? parseInt(m[5], 10) : 0,
  };
}

const dbUrl = parseMysqlUrl(process.env.DB_URL);
const redisUrl = parseRedisUrl(process.env.REDIS_URL);

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '9000', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  DB_HOST: dbUrl.host,
  DB_PORT: dbUrl.port,
  DB_USER: dbUrl.user,
  DB_PASS: dbUrl.pass,
  DB_AUTH: process.env.DB_AUTH || 'acore_auth',
  DB_CHARACTERS: process.env.DB_CHARACTERS || 'acore_characters',
  DB_WORLD: process.env.DB_WORLD || 'acore_world',

  REDIS_URL: process.env.REDIS_URL,
  REDIS_HOST: redisUrl.host,
  REDIS_PORT: redisUrl.port,
  REDIS_PASSWORD: redisUrl.password,
  REDIS_DB: redisUrl.db,
  REDIS_EXPIRE_TIME: parseInt(process.env.REDIS_EXPIRE_TIME || '300', 10),

  JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',

  SOAP_HOST: process.env.SOAP_HOST || '127.0.0.1',
  SOAP_PORT: parseInt(process.env.SOAP_PORT || '7878', 10),
  SOAP_USER: process.env.SOAP_USER || 'admin',
  SOAP_PASS: process.env.SOAP_PASS || 'admin',

  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '',
} as const;
