# RBAC 跨阵营交互配置功能实现方案

## 1. 背景与目标

AzerothCore 的跨阵营好友、交易、频道等交互并不是由 `worldserver.conf` 里的 `AllowTwoSide.*` 控制，而是由 **RBAC（Role-Based Access Control）权限系统**控制。当前已经在 `acore_auth` 库手动给玩家默认角色 `195` 添加了权限 `29`（跨阵营加好友）和 `51`（跨阵营交易）。

本方案目标是在 **acore-manager** 中新增一个 **RBAC 配置页面**，让管理员可以通过 Web 界面勾选/取消勾选这些权限，**一次修改即可对所有现有玩家和未来新注册玩家生效**，避免再手动操作数据库。

---

## 2. RBAC 机制说明

涉及的核心表都在 `acore_auth` 库：

| 表名 | 作用 |
|---|---|
| `rbac_permissions` | 权限清单，`id` + `name`。例如 `29 = Add friends of other faction`。 |
| `rbac_default_permissions` | 账号安全等级 `secId` 与默认角色的映射。普通玩家 `secId=0` → 角色 `195`。 |
| `rbac_linked_permissions` | 角色包含的细粒度权限。`id=角色ID`，`linkedId=权限ID`。 |

**生效方式**：修改 `rbac_linked_permissions` 后，worldserver 需要重新加载 RBAC 数据。可以通过 SOAP 发送 `.reload rbac` 命令实现热加载，无需重启。

---

## 3. 功能范围

- 新增 **RBAC 配置** 菜单与页面，仅 `GM Level >= 3` 可见。
- 默认展示并编辑 **玩家默认角色（195）** 的关联权限。
- 重点支持以下跨阵营相关权限：

| 权限 ID | 英文名 | 中文说明 |
|---|---|---|
| 24 | Two side faction characters on the same account | 同账号双阵营角色创建 |
| 25 | Two side interaction chat | 跨阵营基础聊天 |
| 26 | Two side interaction channel | 跨阵营自定义频道 |
| 27 | Two side mail interaction | 跨阵营邮件 |
| 28 | See two side who list | 跨阵营 /who 列表 |
| 29 | Add friends of other faction | 跨阵营加好友 |
| 51 | Allow trading between factions | 跨阵营交易 |

- 提供权限分类（聊天 / 社交 / 账号）、中文标签和简短说明。
- 变更直接写入 `acore_auth.rbac_linked_permissions`。
- 保存后自动调用 SOAP `.reload rbac` 使配置生效。
- 每次变更记录到 `acm_operation_logs` 审计日志。

---

## 4. 后端实现

### 4.1 新增文件

#### `backend/src/repositories/rbac.repository.ts`

```typescript
export class RbacRepository {
  // 列出所有角色（只包含有默认 secId 映射的角色）
  async getRoles(): Promise<RbacRole[]> { ... }

  // 列出 rbac_permissions 中所有权限
  async getPermissions(): Promise<RbacPermission[]> { ... }

  // 获取某个角色已关联的权限 ID 列表
  async getLinkedPermissionIds(roleId: number): Promise<number[]> { ... }

  // 给角色添加权限（INSERT IGNORE）
  async linkPermission(roleId: number, permissionId: number): Promise<void> { ... }

  // 给角色移除权限（DELETE）
  async unlinkPermission(roleId: number, permissionId: number): Promise<void> { ... }
}

export const rbacRepository = new RbacRepository();
```

#### `backend/src/services/rbac.service.ts`

```typescript
export class RbacService {
  async listRoles() { ... }
  async listPermissions() { ... }
  async getRolePermissions(roleId: number) { ... }

  async updateRolePermissions(
    roleId: number,
    wantedPermissionIds: number[],
    operatorId: number,
  ): Promise<void> {
    // 1. 读取旧权限集合
    // 2. 计算新增/移除集合
    // 3. INSERT 新增，DELETE 移除
    // 4. 调用 soapService.sendCommand('.reload rbac')
    // 5. 调用 auditLogService.record(...) 记录变更
  }
}

export const rbacService = new RbacService();
```

#### `backend/src/routes/rbac.routes.ts`

```typescript
const router = Router();

// GET /api/rbac/roles
router.get('/', authMiddleware, requireGmLevel(3), asyncHandler(...));

// GET /api/rbac/permissions
router.get('/permissions', authMiddleware, requireGmLevel(3), asyncHandler(...));

// GET /api/rbac/roles/:id/permissions
router.get('/roles/:id/permissions', authMiddleware, requireGmLevel(3), asyncHandler(...));

// POST /api/rbac/roles/:id/permissions
// body: { permissionIds: number[] }
router.post('/roles/:id/permissions', authMiddleware, requireGmLevel(3), asyncHandler(...));

export default router;
```

### 4.2 修改现有文件

#### `backend/src/app.ts`

新增路由注册：

```typescript
import rbacRoutes from './routes/rbac.routes';

app.use('/api/rbac', rbacRoutes);
```

---

## 5. 前端实现

### 5.1 新增文件

#### `frontend/src/features/rbac/api/rbac.api.ts`

```typescript
export const rbacApi = {
  getRoles: () => apiClient.get('/rbac/roles'),
  getPermissions: () => apiClient.get('/rbac/permissions'),
  getRolePermissions: (roleId: number) => apiClient.get(`/rbac/roles/${roleId}/permissions`),
  updateRolePermissions: (roleId: number, permissionIds: number[]) =>
    apiClient.post(`/rbac/roles/${roleId}/permissions`, { permissionIds }),
};
```

#### `frontend/src/features/rbac/hooks/useRbac.ts`

使用 TanStack Query 包装：

- `useRbacRoles()`
- `useRbacPermissions()`
- `useRolePermissions(roleId)`
- `useUpdateRolePermissions()`

#### `frontend/src/pages/RbacConfigPage.tsx`

页面结构建议：

1. 顶部标题：RBAC 权限配置 / 跨阵营交互配置。
2. 角色选择下拉框：默认选中 `195 - 玩家默认角色`。
3. 权限卡片列表：按分类分组，每个权限一行：
   - 复选框
   - 权限 ID
   - 中文标签
   - 说明文字
4. 保存按钮：提交后显示 loading / success / error toast。
5. 操作提示：保存后会自动执行 `.reload rbac` 热加载。

### 5.2 修改现有文件

#### `frontend/src/app/router.tsx`

```typescript
const RbacConfigPage = lazy(() => import('@/pages/RbacConfigPage'));

// 在 GmGuard minLevel={3} 下添加
{ path: 'rbac-config', element: withSuspense(RbacConfigPage) }
```

#### `frontend/src/shared/components/AppLayout.tsx`

新增菜单项：

```typescript
import { SlidersHorizontal } from 'lucide-react';

const menuItems = [
  // ...
  { path: '/rbac-config', label: 'RBAC 配置', icon: SlidersHorizontal },
];
```

---

## 6. 权限中文映射

建议在后端 service 或 frontend 常量中维护：

```typescript
export const RBAC_PERMISSION_LABELS: Record<number, { label: string; desc: string; category: string }> = {
  24: { label: '双阵营角色创建', desc: '允许同一账号创建联盟和部落角色', category: '账号' },
  25: { label: '跨阵营基础聊天', desc: '允许 say/yell 等近距离聊天跨阵营可见', category: '聊天' },
  26: { label: '跨阵营频道', desc: '允许自定义聊天频道跨阵营互通', category: '聊天' },
  27: { label: '跨阵营邮件', desc: '允许跨阵营发送邮件', category: '社交' },
  28: { label: '跨阵营 /who', desc: '/who 列表显示对方阵营玩家', category: '社交' },
  29: { label: '跨阵营加好友', desc: '允许添加对方阵营玩家为好友', category: '社交' },
  51: { label: '跨阵营交易', desc: '允许与对方阵营玩家进行交易', category: '社交' },
};
```

对于不在映射中的权限，回退显示 `rbac_permissions.name`。

---

## 7. 审计日志

复用现有 `auditLogService.record`（或 `auditLogRepository.record`），操作类型示例：

- `operation`: `RBAC_PERMISSION_UPDATE`
- `targetType`: `rbac_role`
- `targetId`: roleId
- `details`: JSON 字符串，包含 `{ added: number[], removed: number[] }`
- `operatorId`: 当前登录 GM 账号 ID

---

## 8. 验证步骤

1. 使用 GM Level 3 账号登录 ACM，进入左侧菜单 **RBAC 配置**。
2. 角色选择默认的 **玩家默认角色（195）**。
3. 取消勾选 **跨阵营交易（51）** 和 **跨阵营加好友（29）**，点击保存。
4. 检查 `acore_auth.rbac_linked_permissions` 中对应行已删除。
5. 在游戏中使用普通玩家账号测试：无法跨阵营加好友/交易。
6. 返回 ACM 重新勾选并保存。
7. 检查数据库行已恢复，且 worldserver 日志中执行了 `.reload rbac`。
8. 游戏中再次测试：跨阵营加好友/交易恢复正常。
9. 检查 `acm_operation_logs` 中新增了 `RBAC_PERMISSION_UPDATE` 审计记录。

---

## 9. 注意事项

- 本功能会**直接写入** `acore_auth.rbac_linked_permissions`。这是 RBAC 配置表，不属于玩家实时数据，应视为服务器配置管理。
- 当前手动插入的 `(195, 29)` 和 `(195, 51)` 可以保留；上线后由 ACM 接管即可。
- 建议生产环境首次启用前备份 `acore_auth.rbac_linked_permissions`。
- 后续可扩展支持 GM/Moderator 等其它默认角色的权限管理。
