import { acmDataSource } from './database';
import { AcmSystemConfig } from '@/entities/acm/system-config.entity';
import { logger } from '@/middleware/request-logger';
import { decryptToken } from '@/shared/utils/aes.util';

// acm_system_config 底层读取（agent 工具与 services 共用；agent 不得 import services，
// 故 KV 读取与解密下沉在此，services/system-config.service 基于其上组装业务视图）

export const SYSTEM_CONFIG_KEYS = {
  defaultRealm: 'default_realm',
  soapHost: 'soap_host',
  soapPort: 'soap_port',
  soapUsername: 'soap_username',
  soapPassword: 'soap_password',
  feishuWebhookUrl: 'feishu_webhook_url',
  feishuWebhookSecret: 'feishu_webhook_secret',
  acmWebBaseUrl: 'acm_web_base_url',
  aiDailyTokenBudget: 'ai_daily_token_budget',
  aiAgentCacheSize: 'ai_agent_cache_size',
  aiToolCallBudget: 'ai_tool_call_budget',
  aiToolTimeoutMs: 'ai_tool_timeout_ms',
  loginBruteForceEnabled: 'login_brute_force_enabled',
  loginMaxAttempts: 'login_max_attempts',
  loginLockoutMinutes: 'login_lockout_minutes',
  loginCaptchaEnabled: 'login_captcha_enabled',
  loginCaptchaTtlSeconds: 'login_captcha_ttl_seconds',
} as const;

export const DEFAULT_REALM_FALLBACK = 'realm3';

export async function loadConfigValues(): Promise<Map<string, string>> {
  const rows = await acmDataSource.getRepository(AcmSystemConfig).find();
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.configKey, row.isSecret ? decryptToken(row.configValue) : row.configValue);
  }
  return map;
}

export async function readDefaultRealm(): Promise<string> {
  const values = await loadConfigValues();
  return values.get(SYSTEM_CONFIG_KEYS.defaultRealm) ?? DEFAULT_REALM_FALLBACK;
}

// 运行时读取（消费方路径）：PG 暂不可用时静默回落——返回空 Map，由消费方回退 env 值，
// 保证 GM 命令/登录/巡检不因配置库抖动中断。配置页路径用 loadConfigValues（如实抛错）。
export async function readRuntimeValues(keys: readonly string[]): Promise<Map<string, string>> {
  try {
    const values = await loadConfigValues();
    const picked = new Map<string, string>();
    for (const key of keys) {
      const value = values.get(key);
      if (value !== undefined) picked.set(key, value);
    }
    return picked;
  } catch (err) {
    logger.warn({ err }, '[system-config] 配置读取失败，回落环境变量');
    return new Map();
  }
}

export async function readRuntimeNumber(key: string, fallback: number): Promise<number> {
  const raw = (await readRuntimeValues([key])).get(key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function readRuntimeBool(key: string, fallback: boolean): Promise<boolean> {
  const raw = (await readRuntimeValues([key])).get(key);
  return raw === undefined ? fallback : raw === 'true';
}
