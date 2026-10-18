import { asyncHandler } from '@/shared/async-handler';
import { Request, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authService } from '@/services/auth.service';
import { feishuAuthService } from '@/services/feishu-auth.service';
import { bruteForceService } from '@/services/brute-force.service';
import { captchaService } from '@/services/captcha.service';
import { getClientIp } from '@/shared/utils/ip.util';
import { env } from '@/config/env';
import { readRuntimeBool, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { ServiceError } from '@/shared/errors/service-error';

const router = Router();

// 飞书免登端点轻量限流（内存固定窗口）：code 由飞书签发且一次性，爆破无收益，
// 限流仅防公网刷接口放大出站请求；重启清零可接受
const FEISHU_LOGIN_RATE = { limit: 30, windowMs: 60_000 };
const feishuRateMap = new Map<string, { count: number; resetAt: number }>();
function checkFeishuRate(ip: string): boolean {
  const now = Date.now();
  if (feishuRateMap.size > 1000) {
    for (const [key, entry] of feishuRateMap) {
      if (entry.resetAt <= now) feishuRateMap.delete(key);
    }
  }
  const entry = feishuRateMap.get(ip);
  if (!entry || entry.resetAt <= now) {
    feishuRateMap.set(ip, { count: 1, resetAt: now + FEISHU_LOGIN_RATE.windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= FEISHU_LOGIN_RATE.limit;
}

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
      captchaEnabled: await readRuntimeBool(SYSTEM_CONFIG_KEYS.loginCaptchaEnabled, env.LOGIN_CAPTCHA_ENABLED),
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

router.get(
  '/feishu/status',
  asyncHandler(async (_req: Request, res: Response) => {
    res.jsonSuccess(await feishuAuthService.getStatus());
  }),
);

router.post(
  '/feishu/login',
  [body('code').isString().trim().isLength({ min: 8, max: 256 })],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request', 400);
      return;
    }

    const ip = getClientIp(req);
    if (!checkFeishuRate(ip)) {
      res.jsonError('请求过于频繁，请稍后再试 / Too many requests', 429);
      return;
    }

    try {
      res.jsonSuccess(await feishuAuthService.loginWithCode(req.body.code));
    } catch (err) {
      if (err instanceof ServiceError) {
        res.jsonError(err.message, err.status);
        return;
      }
      throw err;
    }
  }),
);

router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  res.jsonSuccess(req.user);
});

// 高危操作密码二次确认（管理员发件等）：须已登录且 gmlevel=3（当前唯一消费方为发件链路），
// 按 JWT 身份验本人密码，复用登录爆破防护（同 attempts 键空间策略，独立键前缀）
router.post(
  '/verify-password',
  authMiddleware,
  requireGmLevel(3),
  [body('password').isString().isLength({ min: 1, max: 128 })],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request', 400);
      return;
    }

    const ipKey = `verify:attempts:ip:${getClientIp(req)}`;
    const accountKey = `verify:attempts:account:${req.user!.username.toLowerCase()}`;
    const defenseStatus = await bruteForceService.check(ipKey, accountKey);
    if (!defenseStatus.allowed) {
      res.jsonError(formatLockoutMessage(defenseStatus.remainingSeconds), 429);
      return;
    }

    const valid = await authService.verifyPassword(req.user!.id, req.body.password);
    if (!valid) {
      await bruteForceService.recordFailure(ipKey, accountKey);
      res.jsonError('密码错误 / Invalid password', 401);
      return;
    }

    await bruteForceService.recordSuccess(ipKey, accountKey);
    res.jsonSuccess({ valid: true });
  }),
);

export default router;
