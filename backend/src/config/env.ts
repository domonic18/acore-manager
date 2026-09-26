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

// SOAP 连接已支持系统配置页（acm_system_config）管理，DB 优先；此处 SOAP_URL 仅作未录入配置时的回落
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
  // 监听前等待数据库初始化的预算；耗尽则转 degraded 继续监听（后台重试自愈）
  STARTUP_DB_BUDGET_MS: getEnvInt('STARTUP_DB_BUDGET_MS', 15_000),

  // Database names only (connection via DB_URL)
  DB_AUTH: getEnv('DB_AUTH', 'acore_auth'),
  DB_CHARACTERS: getEnv('DB_CHARACTERS', 'acore_characters'),
  DB_WORLD: getEnv('DB_WORLD', 'acore_world'),
  DB_ACM: getEnv('DB_ACM', 'acm'),

  // LLM api_key encryption (infra-level secret only; LLM connection config lives in acm DB)
  LLM_AES_KEY: getEnv('LLM_AES_KEY', 'dev-only-llm-aes-key'),

  // AI notifications & budget (Feishu webhook; empty = log only, never blocks the main flow)
  FEISHU_WEBHOOK_URL: getEnv('FEISHU_WEBHOOK_URL', ''),
  // 自定义机器人加签密钥（安全设置为"签名校验"时必填；空 = 不签名）
  FEISHU_WEBHOOK_SECRET: getEnv('FEISHU_WEBHOOK_SECRET', ''),
  // Web 前端基础地址（飞书日报卡片的报告链接；空 = 卡片不含跳转按钮）
  ACM_WEB_BASE_URL: getEnv('ACM_WEB_BASE_URL', ''),
  AI_DAILY_TOKEN_BUDGET: getEnvInt('AI_DAILY_TOKEN_BUDGET', 5_000_000),

  // Agent runtime (arch 3.2.2 / 3.3.1)
  AI_AGENT_CACHE_SIZE: getEnvInt('AI_AGENT_CACHE_SIZE', 4),
  AI_TOOL_CALL_BUDGET: getEnvInt('AI_TOOL_CALL_BUDGET', 20),
  AI_TOOL_TIMEOUT_MS: getEnvInt('AI_TOOL_TIMEOUT_MS', 5000),

  // Tencent COS (log archive / AI report archive bucket, private-read; credentials are infra-level config)
  COS_SECRET_ID: getEnv('COS_SECRET_ID', ''),
  COS_SECRET_KEY: getEnv('COS_SECRET_KEY', ''),
  COS_BUCKET: getEnv('COS_BUCKET', ''),
  COS_REGION: getEnv('COS_REGION', ''),

  // Tencent SCF (Job 函数异步触发，控制面专用；四项主配置缺任一则触发接口快速失败)
  TENCENT_SECRET_ID: getEnv('TENCENT_SECRET_ID', ''),
  TENCENT_SECRET_KEY: getEnv('TENCENT_SECRET_KEY', ''),
  SCF_REGION: getEnv('SCF_REGION', ''),
  SCF_NAMESPACE: getEnv('SCF_NAMESPACE', 'default'),
  SCF_JOB_FUNCTION_NAME: getEnv('SCF_JOB_FUNCTION_NAME', ''),
  // 留空 = 腾讯云真实端点；本地容器联调指向 scf-mock（同 AWS_ENDPOINT_URL 的端点覆盖惯例，非模式开关）
  SCF_ENDPOINT: getEnv('SCF_ENDPOINT', ''),


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
