import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { accountRepository } from '@/repositories/account.repository';
import { verifySRP6Password } from '@/shared/utils/password.util';
import { logger } from '@/middleware/request-logger';

export interface LoginResult {
  token: string;
  user: {
    id: number;
    username: string;
    gmlevel: number;
  };
}

/** JWT 签发唯一出口：密码登录与飞书免登共用同一格式，middleware/auth 依赖此结构 */
export function issueToken(account: { id: number; username: string }, gmlevel: number): string {
  return jwt.sign(
    { id: account.id, username: account.username, gmlevel },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as any },
  );
}

export class AuthService {
  async login(username: string, password: string): Promise<LoginResult | null> {
    const account = await accountRepository.findByUsername(username);
    if (!account) {
      return null;
    }

    const isValid = verifySRP6Password(
      username,
      password,
      account.salt,
      account.verifier,
    );

    if (!isValid) {
      logger.warn({ username }, 'Invalid password attempt');
      return null;
    }

    const gmlevel = await accountRepository.getGmLevel(account.id);

    if (gmlevel < 1) {
      logger.warn({ username, accountId: account.id }, 'User has insufficient GM level');
      return null;
    }

    logger.info({ userId: account.id, username }, 'User logged in');

    return {
      token: issueToken(account, gmlevel),
      user: {
        id: account.id,
        username: account.username,
        gmlevel,
      },
    };
  }
}

export const authService = new AuthService();
