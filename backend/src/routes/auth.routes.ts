import { asyncHandler } from '../shared/async-handler';
import { Request, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authService } from '../services/auth.service';
import { bruteForceService } from '../services/brute-force.service';
import { captchaService } from '../services/captcha.service';
import { getClientIp } from '../shared/utils/ip.util';
import { env } from '../config/env';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

function buildIpKey(ip: string): string {
  return `login:attempts:ip:${ip}`;
}

function buildAccountKey(username: string): string {
  return `login:attempts:account:${username.toLowerCase()}`;
}

function formatLockoutMessage(remainingSeconds?: number): string {
  if (!remainingSeconds || remainingSeconds <= 0) {
    return '登录尝试次数过多，请稍后再试 / Too many failed login attempts, please try again later';
  }

  const minutes = Math.ceil(remainingSeconds / 60);
  return `登录尝试次数过多，请 ${minutes} 分钟后重试 / Too many failed login attempts, please try again in ${minutes} minutes`;
}

router.get(
  '/login-config',
  asyncHandler(async (_req: Request, res: Response) => {
    res.jsonSuccess({
      captchaEnabled: env.LOGIN_CAPTCHA_ENABLED,
    });
  }),
);

router.get(
  '/captcha',
  asyncHandler(async (_req: Request, res: Response) => {
    const captcha = await captchaService.generate();

    if (!captcha) {
      res.jsonError('Captcha is disabled', 503);
      return;
    }

    res.jsonSuccess(captcha);
  }),
);

router.post(
  '/login',
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request', 400);
      return;
    }

    const { username, password, captchaSessionId, captchaCode } = req.body;
    const clientIp = getClientIp(req);
    const ipKey = buildIpKey(clientIp);
    const accountKey = buildAccountKey(username);

    const defenseStatus = await bruteForceService.check(ipKey, accountKey);

    if (!defenseStatus.allowed) {
      res.jsonError(formatLockoutMessage(defenseStatus.remainingSeconds), 429);
      return;
    }

    if (defenseStatus.requireCaptcha) {
      if (!captchaSessionId || !captchaCode) {
        await bruteForceService.recordFailure(ipKey, accountKey);
        res.status(401).json({
          success: false,
          error: '需要验证码 / Captcha required',
          data: { requireCaptcha: true },
        });
        return;
      }

      const captchaValid = await captchaService.verify({
        sessionId: captchaSessionId,
        code: captchaCode,
      });

      if (!captchaValid) {
        await bruteForceService.recordFailure(ipKey, accountKey);
        res.jsonError('验证码错误 / Invalid captcha', 401);
        return;
      }
    }

    const result = await authService.login(username, password);

    if (!result) {
      await bruteForceService.recordFailure(ipKey, accountKey);
      res.jsonError('Invalid username or password', 401);
      return;
    }

    await bruteForceService.recordSuccess(ipKey, accountKey);

    res.jsonSuccess(result);
  }),
);

router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  res.jsonSuccess(req.user);
});

export default router;
