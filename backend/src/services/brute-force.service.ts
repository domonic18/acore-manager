import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../middleware/request-logger';

export interface LoginDefenseStatus {
  allowed: boolean;
  requireCaptcha: boolean;
  remainingSeconds?: number;
}

export class BruteForceService {
  private get enabled(): boolean {
    return env.LOGIN_BRUTE_FORCE_ENABLED;
  }

  private get maxAttempts(): number {
    return env.LOGIN_MAX_ATTEMPTS;
  }

  private get captchaEnabled(): boolean {
    return env.LOGIN_CAPTCHA_ENABLED;
  }

  private get captchaThreshold(): number {
    return 3;
  }

  private get lockoutSeconds(): number {
    return env.LOGIN_LOCKOUT_MINUTES * 60;
  }

  async check(ipKey: string, accountKey: string): Promise<LoginDefenseStatus> {
    if (!this.enabled) {
      return { allowed: true, requireCaptcha: false };
    }

    try {
      const [ipCount, accountCount] = await Promise.all([
        this.getAttemptCount(ipKey),
        this.getAttemptCount(accountKey),
      ]);

      const maxCount = Math.max(ipCount, accountCount);

      if (maxCount >= this.maxAttempts) {
        const remainingSeconds = await this.getMaxRemainingTtl(ipKey, accountKey);
        return { allowed: false, requireCaptcha: false, remainingSeconds };
      }

      return {
        allowed: true,
        requireCaptcha: this.captchaEnabled && maxCount >= this.captchaThreshold,
      };
    } catch (error) {
      logger.warn({ error }, 'Brute-force check failed, allowing login');
      return { allowed: true, requireCaptcha: false };
    }
  }

  async recordFailure(ipKey: string, accountKey: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      await Promise.all([
        this.incrementAttempts(ipKey),
        this.incrementAttempts(accountKey),
      ]);
    } catch (error) {
      logger.warn({ error }, 'Failed to record login failure');
    }
  }

  async recordSuccess(ipKey: string, accountKey: string): Promise<void> {
    if (!this.enabled) {
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

  private async incrementAttempts(key: string): Promise<void> {
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, this.lockoutSeconds);
    await pipeline.exec();
  }

  private async getMaxRemainingTtl(ipKey: string, accountKey: string): Promise<number> {
    try {
      const [ipTtl, accountTtl] = await Promise.all([redis.ttl(ipKey), redis.ttl(accountKey)]);
      return Math.max(ipTtl, accountTtl);
    } catch {
      return this.lockoutSeconds;
    }
  }
}

export const bruteForceService = new BruteForceService();
