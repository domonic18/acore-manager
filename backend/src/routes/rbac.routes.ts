import { Response, Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { asyncHandler } from '../shared/async-handler';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireGmLevel } from '../middleware/gm-guard';
import { rbacService } from '../services/rbac.service';

const router = Router();

router.get(
  '/roles',
  authMiddleware,
  requireGmLevel(3),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const roles = await rbacService.listRoles();
    res.jsonSuccess(roles, roles.length);
  }),
);

router.get(
  '/permissions',
  authMiddleware,
  requireGmLevel(3),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const permissions = await rbacService.listPermissions();
    res.jsonSuccess(permissions, permissions.length);
  }),
);

router.get(
  '/roles/:id/permissions',
  authMiddleware,
  requireGmLevel(3),
  [param('id').isInt({ min: 1 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid role ID', 400);
      return;
    }

    const roleId = parseInt(req.params.id, 10);
    const permissionIds = await rbacService.getRolePermissions(roleId);
    res.jsonSuccess(permissionIds, permissionIds.length);
  }),
);

router.post(
  '/roles/:id/permissions',
  authMiddleware,
  requireGmLevel(3),
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('permissionIds').isArray(),
    body('permissionIds.*').isInt({ min: 1 }).toInt(),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters', 400);
      return;
    }

    const roleId = parseInt(req.params.id, 10);
    const { permissionIds } = req.body;
    const operatorId = req.user?.id || 0;
    const operatorName = req.user?.username || '';

    await rbacService.updateRolePermissions(roleId, permissionIds, operatorId, operatorName);
    res.jsonSuccess({ success: true });
  }),
);

export default router;
