import { asyncHandler } from '@/shared/async-handler';
import { Request, Response, Router } from 'express';
import { param, query, body, validationResult } from 'express-validator';
import { authMiddleware } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { characterService } from '@/services/character.service';

const router = Router();

router.get(
  '/',
  authMiddleware,
  requireGmLevel(1),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('includeDeleted').optional().isBoolean().toBoolean(),
    query('online').optional().isBoolean().toBoolean(),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters', 400);
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = req.query.search as string | undefined;
    const includeDeleted = req.query.includeDeleted as boolean | undefined;
    const online = req.query.online as boolean | undefined;

    const result = await characterService.listCharacters(page, pageSize, search, includeDeleted, online);
    res.jsonSuccess(result, result.items.length);
  }),
);

// 角色名联想（GM 工具邮件目标输入）：前缀匹配轻量列表；须先于 /:guid 注册
router.get(
  '/suggest',
  authMiddleware,
  requireGmLevel(1),
  [query('prefix').isString().trim().isLength({ min: 1, max: 50 }), query('limit').optional().isInt({ min: 1, max: 20 }).toInt()],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters', 400);
      return;
    }
    const names = await characterService.suggestNames(req.query.prefix as string, (req.query.limit as unknown as number) ?? 8);
    res.jsonSuccess(names, names.length);
  }),
);

router.get(
  '/:guid',
  authMiddleware,
  requireGmLevel(1),
  [param('guid').isInt().toInt()],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid character GUID', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    const detail = await characterService.getCharacterDetail(guid);

    if (!detail) {
      res.jsonError('Character not found', 404);
      return;
    }

    res.jsonSuccess(detail);
  }),
);

// 角色物品全量（装备/背包/银行）：纯只读，前端按 bag/slot 分区渲染
router.get(
  '/:guid/inventory',
  authMiddleware,
  requireGmLevel(1),
  [param('guid').isInt().toInt()],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid character GUID', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    const items = await characterService.getCharacterInventory(guid);
    res.jsonSuccess(items, items.length);
  }),
);

router.post(
  '/:guid/ban',
  authMiddleware,
  requireGmLevel(2),
  [
    param('guid').isInt().toInt(),
    body('duration').isString().trim().notEmpty(),
    body('reason').isString().trim().notEmpty(),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    const { duration, reason } = req.body;
    await characterService.banCharacter(guid, (req as any).user?.id || 0, duration, reason);

    res.jsonSuccess({ banned: true });
  }),
);

router.post(
  '/:guid/unban',
  authMiddleware,
  requireGmLevel(2),
  [param('guid').isInt().toInt()],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid character GUID', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    await characterService.unbanCharacter(guid, (req as any).user?.id || 0);

    res.jsonSuccess({ unbanned: true });
  }),
);

router.post(
  '/:guid/mute',
  authMiddleware,
  requireGmLevel(2),
  [
    param('guid').isInt().toInt(),
    body('duration').isString().trim().notEmpty(),
    body('reason').isString().trim().notEmpty(),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    const { duration, reason } = req.body;
    await characterService.muteCharacter(guid, (req as any).user?.id || 0, duration, reason);

    res.jsonSuccess({ muted: true });
  }),
);

router.post(
  '/:guid/unmute',
  authMiddleware,
  requireGmLevel(2),
  [param('guid').isInt().toInt()],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid character GUID', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    await characterService.unmuteCharacter(guid, (req as any).user?.id || 0);

    res.jsonSuccess({ unmuted: true });
  }),
);

// 踢下线（AC 原生 .kick 经 SOAP）：处罚级操作 gmlevel≥2，回执与审计见 service
router.post(
  '/:guid/kick',
  authMiddleware,
  requireGmLevel(2),
  [
    param('guid').isInt().toInt(),
    body('reason').optional().isString().trim().isLength({ max: 200 }),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    try {
      const result = await characterService.kickCharacter(
        guid,
        (req as any).user?.id || 0,
        (req as any).user?.username || '',
        req.body.reason as string | undefined,
      );
      res.jsonSuccess(result);
    } catch (err) {
      res.jsonError((err as Error).message || '踢下线失败', 400);
    }
  }),
);

// 单向私信（在线 .send message / 离线降级 .send mail）：gmlevel≥2 + 审计
router.post(
  '/:guid/message',
  authMiddleware,
  requireGmLevel(2),
  [
    param('guid').isInt().toInt(),
    body('message').isString().trim().isLength({ min: 1, max: 255 }),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('消息须为 1-255 字', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    try {
      const result = await characterService.messageCharacter(
        guid,
        (req as any).user?.id || 0,
        (req as any).user?.username || '',
        req.body.message as string,
      );
      res.jsonSuccess(result);
    } catch (err) {
      res.jsonError((err as Error).message || '发送失败', 400);
    }
  }),
);

export default router;
