import { Response, Router } from 'express';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { listPromptDocs, listSkillDocs } from '@/agent/core/prompt-loader';

// 提示词库（文件为真源，只读）：场景提示词（agent/prompts/*.yaml）+ 技能文档（agent/skills/*/SKILL.md）
// 全量返回供前端查看/搜索。纯读不审计（与其他 GET 一致）；提示词修改走 git 提交，本端点无任何写路径。
const router = Router();

router.get(
  '/',
  authMiddleware,
  requireGmLevel(2),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.jsonSuccess({ scenes: listPromptDocs(), skills: listSkillDocs() });
  }),
);

export default router;
