import { redis } from '@/config/redis';
import { env } from '@/config/env';
import { readRuntimeValues, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { logger } from '@/middleware/request-logger';

export interface LoginDefenseStatus {
  allowed: boolean;
  requireCaptcha: boolean;
  remainingSeconds?: number;
}

interface LoginLimits {
  enabled: boolean;
  maxAttempts: number;
  captchaEnabled: boolean;
  lockoutSeconds: number;
}

export class BruteForceService {
  private readonly captchaThreshold = 3;

  // 开关/阈值优先读系统配置页，PG 不可用时 readRuntimeValues 静默回落环境变量
  private async loginLimits(): Promise<LoginLimits> {
    const k = SYSTEM_CONFIG_KEYS;
    const cfg = await readRuntimeValues([
      k.loginBruteForceEnabled,
      k.loginMaxAttempts,
      k.loginCaptchaEnabled,
      k.loginLockoutMinutes,
    ]);
    const num = (key: string, fallback: number): number => {
      const raw = cfg.get(key);
      if (raw === undefined) return fallback;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const bool = (key: string, fallback: boolean): boolean => {
      const raw = cfg.get(key);
      return raw === undefined ? fallback : raw === 'true';
    };
    return {
      enabled: bool(k.loginBruteForceEnabled, env.LOGIN_BRUTE_FORCE_ENABLED),
      maxAttempts: num(k.loginMaxAttempts, env.LOGIN_MAX_ATTEMPTS),
      captchaEnabled: bool(k.loginCaptchaEnabled, env.LOGIN_CAPTCHA_ENABLED),
      lockoutSeconds: num(k.loginLockoutMinutes, env.LOGIN_LOCKOUT_MINUTES) * 60,
    };
  }

  async check(ipKey: string, accountKey: string): Promise<LoginDefenseStatus> {
    const limits = await this.loginLimits();
    if (!limits.enabled) {
      return { allowed: true, requireCaptcha: false };
    }

    try {
      const [ipCount, accountCount] = await Promise.all([
        this.getAttemptCount(ipKey),
        this.getAttemptCount(accountKey),
      ]);

      const maxCount = Math.max(ipCount, accountCount);

      if (maxCount >= limits.maxAttempts) {
        const remainingSeconds = await this.getMaxRemainingTtl(ipKey, accountKey, limits.lockoutSeconds);
        return { allowed: false, requireCaptcha: false, remainingSeconds };
      }

      return {
        allowed: true,
        requireCaptcha: limits.captchaEnabled && maxCount >= this.captchaThreshold,
      };
    } catch (error) {
      logger.warn({ error }, 'Brute-force check failed, allowing login');
      return { allowed: true, requireCaptcha: false };
    }
  }

  async recordFailure(ipKey: string, accountKey: string): Promise<void> {
    const limits = await this.loginLimits();
    if (!limits.enabled) {
      return;
    }

    try {
      await Promise.all([
        this.incrementAttempts(ipKey, limits.lockoutSeconds),
        this.incrementAttempts(accountKey, limits.lockoutSeconds),
      ]);
    } catch (error) {
      logger.warn({ error }, 'Failed to record login failure');
    }
  }

  async recordSuccess(ipKey: string, accountKey: string): Promise<void> {
    const limits = await this.loginLimits();
    if (!limits.enabled) {
      return;
    }

    try {
      await Promise.all([redis.del(ipKey), redis.del(accountKey)]);
    } catch (error) {
      logger.warn({ error }, 'Failed to clear login attempts on success');
    }
  }

  private async getAttemptCount(key: string): Promise<number> {
    const value = await redis.get(key);
    if (value === null) return 0;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private async incrementAttempts(key: string, lockoutSeconds: number): Promise<void> {
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, lockoutSeconds);
    await pipeline.exec();
  }

  private async getMaxRemainingTtl(ipKey: string, accountKey: string, lockoutSeconds: number): Promise<number> {
    try {
      const [ipTtl, accountTtl] = await Promise.all([redis.ttl(ipKey), redis.ttl(accountKey)]);
      return Math.max(ipTtl, accountTtl);
    } catch {
      return lockoutSeconds;
    }
  }
}

export const bruteForceService = new BruteForceService();
