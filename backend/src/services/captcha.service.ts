import crypto from 'crypto';
import svgCaptcha from 'svg-captcha';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../middleware/request-logger';

export interface CaptchaResult {
  sessionId: string;
  svg: string;
}

export interface CaptchaVerifyParams {
  sessionId: string;
  code: string;
}

export class CaptchaService {
  private get enabled(): boolean {
    return env.LOGIN_CAPTCHA_ENABLED;
  }

  private get ttlSeconds(): number {
    return env.LOGIN_CAPTCHA_TTL_SECONDS;
  }

  private buildKey(sessionId: string): string {
    return `captcha:session:${sessionId}`;
  }

  async generate(): Promise<CaptchaResult | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const { data, text } = svgCaptcha.create({
        size: 4,
        noise: 3,
        color: true,
        width: 120,
        height: 40,
        fontSize: 36,
        ignoreChars: '0o1iIl',
      });

      const sessionId = crypto.randomUUID();
      await redis.setex(this.buildKey(sessionId), this.ttlSeconds, text.toLowerCase());

      return { sessionId, svg: data };
    } catch (error) {
      logger.warn(error, 'Failed to generate captcha');
      return null;
    }
  }

  async verify(params: CaptchaVerifyParams): Promise<boolean> {
    if (!this.enabled) {
      return true;
    }

    if (!params.sessionId || !params.code) {
      return false;
    }

    try {
      const key = this.buildKey(params.sessionId);
      const expected = await redis.get(key);
      await redis.del(key);

      if (!expected) {
        return false;
      }

      return expected === params.code.toLowerCase();
    } catch (error) {
      logger.warn({ error }, 'Failed to verify captcha');
      // Redis 异常时放行，避免无法登录
      return true;
    }
  }
}

export const captchaService = new CaptchaService();
