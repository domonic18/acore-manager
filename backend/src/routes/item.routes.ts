import { Request, Response, Router } from 'express';
import { query, validationResult } from 'express-validator';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { itemService } from '@/services/item.service';

// 物品搜索（管理员邮件附件 typeahead）：entry 前缀 + zhCN/英文名模糊，轻量 LIMIT 列表；
// 仅服务于发件链路，随发件同级 gmlevel=3
const router = Router();

router.get(
  '/search',
  authMiddleware,
  requireGmLevel(3),
  [query('q').isString().trim().isLength({ min: 1, max: 64 }), query('limit').optional().isInt({ min: 1, max: 20 }).toInt()],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters', 400);
      return;
    }
    const items = await itemService.searchItems(req.query.q as string, (req.query.limit as unknown as number) ?? 10);
    res.jsonSuccess(items, items.length);
  }),
);

export default router;
