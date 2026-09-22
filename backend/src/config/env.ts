/**
 * Centralized environment variable validation and loading.
 * Provides type-safe access to all environment variables with sensible defaults.
 * Supports both connection-string and split-field styles.
 */

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvInt(key: string, defaultValue?: number): number {
  const raw = process.env[key];
  if (raw === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid integer, got: ${raw}`);
  }
  return parsed;
}

interface MysqlConn {
  host: string;
  port: number;
  user: string;
  pass: string;
}

function parseMysqlUrl(url?: string): MysqlConn | null {
  if (!url) return null;
  const m = url.match(/^mysql:\/\/([^:]+):([^@]+)@([^:]+)(?::(\d+))?\/?$/i);
  if (!m) return null;
  return {
    user: decodeURIComponent(m[1]),
    pass: decodeURIComponent(m[2]),
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 3306,
  };
}

interface PgConn {
  host: string;
  port: number;
  user: string;
  pass: string;
  database: string;
}

function parsePgUrl(url?: string): PgConn | null {
  if (!url) return null;
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^/?]+)/i);
  if (!m) return null;
  return {
    user: decodeURIComponent(m[1]),
    pass: decodeURIComponent(m[2]),
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 5432,
    database: decodeURIComponent(m[5]),
  };
}

interface RedisConn {
  host: string;
  port: number;
  password: string;
  db: number;
}

function parseRedisUrl(url?: string): RedisConn | null {
  if (!url) return null;
  const m = url.match(/^redis:\/\/(?:(?:([^:@]*):)?([^@]*)@)?([^:/]+)(?::(\d+))?(?:\/(\d+))?\/?$/i);
  if (!m) return null;
  return {
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 6379,
    password: m[2] ? decodeURIComponent(m[2]) : '',
    db: m[5] ? parseInt(m[5], 10) : 0,
  };
}

interface SoapConn {
  host: string;
  port: number;
  user: string;
  pass: string;
}

function parseSoapUrl(url?: string): SoapConn | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^:]+):([^@]+)@([^:]+)(?::(\d+))?\/?$/i);
  if (!m) return null;
  return {
    user: decodeURIComponent(m[1]),
    pass: decodeURIComponent(m[2]),
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 7878,
  };
}

export const dbConn = parseMysqlUrl(process.env.DB_URL) ?? {
  host: '127.0.0.1',
  port: 3306,
  user: 'acore',
  pass: 'acore',
};

// acm 自有库连接（PostgreSQL），与游戏 MySQL（DB_URL）隔离
export const acmDbConn = parsePgUrl(process.env.ACM_DB_URL) ?? {
  host: '127.0.0.1',
  port: 5433,
  user: 'acm',
  pass: 'acm',
  database: 'acm',
};

export const redisConn = parseRedisUrl(process.env.REDIS_URL) ?? {
  host: '127.0.0.1',
  port: 6379,
  password: '',
  db: 0,
};

export const soapConn = parseSoapUrl(process.env.SOAP_URL) ?? {
  host: '127.0.0.1',
  port: 7878,
  user: 'admin',
  pass: 'admin',
};

export const env = {
  // Application
  NODE_ENV: getEnv('NODE_ENV', 'production'),
  PORT: getEnvInt('PORT', 9000),
  LOG_LEVEL: getEnv('LOG_LEVEL', 'info'),

  // Database names only (connection via DB_URL)
  DB_AUTH: getEnv('DB_AUTH', 'acore_auth'),
  DB_CHARACTERS: getEnv('DB_CHARACTERS', 'acore_characters'),
  DB_WORLD: getEnv('DB_WORLD', 'acore_world'),
  DB_ACM: getEnv('DB_ACM', 'acm'),

  // LLM api_key encryption (infra-level secret only; LLM connection config lives in acm DB)
  LLM_AES_KEY: getEnv('LLM_AES_KEY', 'dev-only-llm-aes-key'),

  // AI notifications & budget (Feishu webhook; empty = log only, never blocks the main flow)
  FEISHU_WEBHOOK_URL: getEnv('FEISHU_WEBHOOK_URL', ''),
  AI_DAILY_TOKEN_BUDGET: getEnvInt('AI_DAILY_TOKEN_BUDGET', 5_000_000),

  // Agent runtime (arch 3.2.2 / 3.3.1)
  AI_AGENT_CACHE_SIZE: getEnvInt('AI_AGENT_CACHE_SIZE', 4),
  AI_TOOL_CALL_BUDGET: getEnvInt('AI_TOOL_CALL_BUDGET', 20),
  AI_TOOL_TIMEOUT_MS: getEnvInt('AI_TOOL_TIMEOUT_MS', 5000),

  // Redis (connection via REDIS_URL)
  REDIS_EXPIRE_TIME: getEnvInt('REDIS_EXPIRE_TIME', 300),

  // JWT Auth
  JWT_SECRET: getEnv('JWT_SECRET', 'change-me-in-production'),
  JWT_EXPIRES_IN: getEnv('JWT_EXPIRES_IN', '8h'),

  // Login brute-force protection
  LOGIN_BRUTE_FORCE_ENABLED: getEnv('LOGIN_BRUTE_FORCE_ENABLED', 'true') === 'true',
  LOGIN_MAX_ATTEMPTS: getEnvInt('LOGIN_MAX_ATTEMPTS', 5),
  LOGIN_LOCKOUT_MINUTES: getEnvInt('LOGIN_LOCKOUT_MINUTES', 15),

  // Self-hosted captcha (SVG image based)
  LOGIN_CAPTCHA_ENABLED: getEnv('LOGIN_CAPTCHA_ENABLED', 'false') === 'true',
  LOGIN_CAPTCHA_TTL_SECONDS: getEnvInt('LOGIN_CAPTCHA_TTL_SECONDS', 300),

  // CORS
  ALLOWED_ORIGINS: getEnv('ALLOWED_ORIGINS', '*'),
} as const;

export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
