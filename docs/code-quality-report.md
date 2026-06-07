# acore-manager 代码质量分析报告

> 分析日期：2026/06/07
> 分析范围：backend/src + frontend/src
> 代码总行数：6,532 行（Backend 2,945 行 / Frontend 3,587 行）

---

## 一、项目概览

AzerothCore Manager（ACM）是一个面向 AzerothCore 魔兽世界私服的全端管理后台系统，采用前后端合一的单体容器架构。

| 项目属性 | 说明 |
|---------|------|
| **技术栈** | Express + TypeORM + React 18 + Vite + Tailwind CSS |
| **部署方式** | 单一 Docker 镜像，Express 托管 API + 静态文件 |
| **数据库** | MySQL 8（多数据源：auth/characters/world） |
| **缓存** | Redis 7 |
| **认证** | JWT + AzerothCore GM 等级权限 |
| **GM 命令** | SOAP/RA 接口调用 worldserver |

---

## 二、10 维度代码质量评估

### 维度 1：文档质量（5.8 / 10 分）

#### 1a. 文档完备性（3.0 / 4 分）

| 检查项 | 状态 | 得分 |
|--------|------|------|
| README 存在且 >=50 行 | 54 行，覆盖技术栈、快速开始、文档索引 | 1.2 / 1.2 |
| 架构文档存在 | 4 个架构文档（整体/后端/前端/部署） | 1.0 / 1.0 |
| API 文档存在 | 后端架构文档中包含完整 API 端点列表 | 0.8 / 0.8 |
| README 内容覆盖 | 缺少开发指南、License 信息不完整 | 0.0 / 1.0 |

#### 1b. 文档与代码一致性（1.5 / 3 分）

| 比对项 | 文档描述 | 实际代码 | 不一致数 | 得分 |
|--------|---------|---------|---------|------|
| 架构文档 vs 代码结构 | 后端目录结构描述完整 | 实际缺少 audit-logger.ts、多个 repository 文件、types/express.d.ts 等 | 9 处 | 0.3 / 0.75 |
| 前端架构 vs 代码结构 | 描述了完整的组件/工具/类型文件 | 实际缺少 16 个文件（Sidebar、Header、DataTable、endpoints.ts 等） | 16 处 | 0.2 / 0.75 |
| API 文档 vs 路由代码 | 文档列出 30+ 端点 | 实际路由与文档基本一致，新增 ip-bans/mutes/banlist 等端点 | 3 处 | 0.5 / 0.75 |
| 部署文档 vs 配置文件 | Dockerfile、docker-compose 描述准确 | scripts/build.sh 缺失，.env.example 格式从分字段改为连接串 | 2 处 | 0.5 / 0.75 |

**不一致项详情表**

| 文档位置 | 文档描述 | 实际代码 | 差异类型 | 严重程度 |
|---------|---------|---------|---------|---------|
| 02后端架构.md | `audit-logger.ts` 中间件 | 不存在 | 文件缺失 | 中 |
| 02后端架构.md | `transaction.repository.ts` | 不存在，Service 直接执行 SQL | 文件缺失 | 中 |
| 02后端架构.md | `character.repository.ts` | 不存在 | 文件缺失 | 中 |
| 02后端架构.md | `jwt.util.ts` | 不存在，JWT 逻辑在 auth.service.ts | 文件缺失 | 低 |
| 02后端架构.md | `gold.util.ts` / `faction.util.ts` | 不存在 | 文件缺失 | 低 |
| 02后端架构.md | `types/express.d.ts` | 不存在，类型内联定义 | 文件缺失 | 低 |
| 03前端架构.md | `shared/api/endpoints.ts` | 不存在，API 路径硬编码在各 api.ts | 文件缺失 | 中 |
| 03前端架构.md | `shared/components/Sidebar.tsx` | 内联在 AppLayout.tsx | 文件缺失 | 低 |
| 03前端架构.md | `shared/components/DataTable.tsx` | 不存在，各页面自行实现表格 | 文件缺失 | 中 |
| 04部署架构.md | `scripts/build.sh` | 不存在 | 文件缺失 | 低 |
| 04部署架构.md | `.env.example` 分字段格式 | 实际使用连接串格式（DB_URL/REDIS_URL/SOAP_URL） | 格式变更 | 中 |

#### 1c. 文档唯一性（1.3 / 3 分）

| 重复区域检测 | 文档 A | 文档 B | 重复内容 | 一致性 | 状态 |
|-------------|--------|--------|---------|--------|------|
| 技术栈描述 | 01整体架构.md | 02后端架构.md | Node.js/Express/TypeORM 等 | 一致 | 维护负担 |
| 技术栈描述 | 01整体架构.md | 03前端架构.md | React/Vite/Tailwind 等 | 一致 | 维护负担 |
| 部署架构图 | 01整体架构.md | 04部署架构.md | 单体容器部署图 | 一致 | 维护负担 |
| 环境变量 | 01整体架构.md | 04部署架构.md | .env.example 内容 | 一致 | 维护负担 |
| Express 静态托管 | 02后端架构.md | 04部署架构.md | app.ts 静态文件配置 | 一致 | 维护负担 |
| 目录结构 | 01整体架构.md | 04部署架构.md | 项目根目录结构 | 一致 | 维护负担 |

**文档唯一性统计**

| 指标 | 数量 |
|------|------|
| 重复内容区域 | 6 处 |
| 矛盾内容 | 0 处 |
| 高风险重复区域 | 0 处 |

---

### 维度 2：目录结构（7.0 / 10 分）

| 检查项 | 评估结果 | 得分 |
|--------|---------|------|
| 层级深度 | 最大 10 层（frontend/src/features/X/components/ui），但业务代码最大 6 层，shadcn/ui 组件目录较深 | 1.5 / 2.5 |
| 命名规范 | 后端全部 kebab-case，前端 pages 使用 PascalCase（符合 React 惯例），无空格/大写开头目录 | 2.5 / 2.5 |
| 模块划分 | 后端 routes/services/repositories/entities 分层清晰；前端 features/shared/pages/app 分层清晰 | 2.5 / 3.0 |
| 测试目录 | backend/test/unit + backend/test/e2e + frontend/src/__tests__/unit 存在，但测试覆盖率低 | 0.5 / 2.0 |

---

### 维度 3：代码规模（9.0 / 10 分）

| 指标 | 数值 | 阈值 | 得分 |
|------|------|------|------|
| 大文件（>500 行） | 1 个 | <=10 个 | 5.0 / 5.0 |
| 超大文件（>1000 行） | 0 个 | <=3 个 | 3.0 / 3.0 |
| 代码总行数 | 6,532 行 | 记录 | 1.0 / 2.0 |

**大文件详情**

| 文件 | 行数 | 说明 |
|------|------|------|
| `frontend/src/pages/AccountDetailPage.tsx` | 546 | 账号详情页，包含封禁/解禁/改密码对话框逻辑 |

---

### 维度 4：复杂度（9.5 / 12 分）

| 指标 | 数值 | 阈值 | 得分 |
|------|------|------|------|
| 高复杂度文件（>25 分支） | 0 个 | <=5 个 | 4.8 / 4.8 |
| 过深嵌套文件（>4 层缩进 >5 行） | 11 个 | >10 个 | 0.0 / 3.6 |
| 过长函数（>100 行连续代码块） | 0 个 | <=10 个 | 3.6 / 3.6 |

**嵌套深度风险文件**

| 文件 | 深嵌套行数 | 说明 |
|------|-----------|------|
| `frontend/src/pages/AccountListPage.tsx` | 85 | JSX 嵌套 |
| `frontend/src/pages/AccountDetailPage.tsx` | 80 | JSX + 对话框状态 |
| `frontend/src/pages/BanlistPage.tsx` | 65 | JSX 嵌套 |
| `frontend/src/pages/GmAccountPage.tsx` | 66 | JSX 嵌套 |
| `frontend/src/pages/CharacterListPage.tsx` | 49 | JSX 嵌套 |
| `frontend/src/pages/TransactionPage.tsx` | 44 | JSX 嵌套 |
| `frontend/src/pages/MuteListPage.tsx` | 51 | JSX 嵌套 |
| `frontend/src/pages/AuditLogPage.tsx` | 39 | JSX 嵌套 |
| `frontend/src/pages/IpBanPage.tsx` | 39 | JSX 嵌套 |
| `frontend/src/pages/CharacterDetailPage.tsx` | 32 | JSX 嵌套 |
| `frontend/src/shared/components/AppLayout.tsx` | 17 | JSX 嵌套 |

> 注：以上嵌套主要为 JSX 模板嵌套，非控制流嵌套，实际业务逻辑复杂度不高。

---

### 维度 5：代码健康度（2.0 / 10 分）

| 指标 | 数值 | 标准 | 得分 |
|------|------|------|------|
| 注释覆盖率（Backend） | 0.54%（16 / 2,945 行） | >=15% | 0.0 / 6.0 |
| 注释覆盖率（Frontend） | 0.13%（5 / 3,587 行） | >=15% | 0.0 / 6.0 |
| TODO/FIXME 数量 | 0 个 | <=20 个 | 2.0 / 4.0 |

**注释缺失严重**：整个项目仅有 21 行注释，关键业务逻辑（SRP6 密码验证、SOAP 命令封装、缓存策略）均无注释说明。

---

### 维度 6：依赖安全（4.9 / 7 分）

| 检查项 | 结果 | 得分 |
|--------|------|------|
| 依赖文件完整性 | backend/package.json + frontend/package.json + package-lock.json 均存在 | 2.1 / 2.1 |
| 高危漏洞 | Frontend: 1 Critical | 0.0 / 2.8 |
| 中危漏洞 | Frontend: 4 Moderate | 2.1 / 2.1 |

**漏洞详情**

| 项目 | 严重级别 | 数量 |
|------|---------|------|
| Backend | Critical | 0 |
| Backend | High | 0 |
| Backend | Moderate | 0 |
| Frontend | Critical | 1 |
| Frontend | High | 0 |
| Frontend | Moderate | 4 |

> Frontend 存在 1 个 Critical 漏洞，建议运行 `npm audit fix` 修复。

---

### 维度 7：测试质量（2.0 / 7 分）

| 检查项 | 结果 | 得分 |
|--------|------|------|
| 测试文件数量 | 4 个（Backend 3 + Frontend 1） | 0.0 / 3.5 |
| 测试目录结构 | backend/test/unit + backend/test/e2e + frontend/src/__tests__/unit | 2.0 / 3.5 |

**测试文件列表**

| 文件 | 类型 | 说明 |
|------|------|------|
| `backend/test/unit/utils/password.util.test.ts` | 单元测试 | SRP6 密码验证 |
| `backend/test/unit/services/cache.service.test.ts` | 单元测试 | 缓存服务 |
| `backend/test/e2e/routes/health.routes.test.ts` | E2E 测试 | 健康检查路由 |
| `frontend/src/__tests__/unit/utils/gold.test.ts` | 单元测试 | 金币格式化 |

> 测试覆盖率极低，核心业务逻辑（账号管理、角色管理、GM 工具、交易记录）均无测试覆盖。

---

### 维度 8：硬编码检测（6.8 / 8 分）

| 检查项 | 结果 | 得分 |
|--------|------|------|
| 敏感信息硬编码 | 0 处（JWT_SECRET 有默认值但为占位符） | 3.2 / 3.2 |
| 配置硬编码 | 3 处（SOAP XML 命名空间、超时时间） | 2.0 / 2.8 |
| 魔法数字 | 多处 HTTP 状态码、分页默认值、缓存 TTL | 1.6 / 2.0 |

**硬编码详情**

| 位置 | 硬编码内容 | 说明 |
|------|-----------|------|
| `backend/src/services/soap.service.ts:40-42` | SOAP XML 命名空间 URL | 标准协议命名空间，可接受 |
| `backend/src/config/redis.ts:6` | `connectTimeout: 5000` | 应提取为常量 |
| `backend/src/config/env.ts:87` | `REDIS_EXPIRE_TIME: 300` | 有环境变量覆盖 |
| 各 routes 文件 | `pageSize: 20`, `max: 100` | 分页参数重复硬编码 |

---

### 维度 9：Git 提交规范（6.8 / 8 分）

| 检查项 | 结果 | 得分 |
|--------|------|------|
| 提交类型规范 | 88% 符合 Conventional Commits（37/42） | 3.2 / 3.2 |
| 提交描述质量 | 双语描述，大部分清晰，有 scope | 2.0 / 2.8 |
| 提交粒度 | 大部分合理，个别提交文件变更过多 | 1.6 / 2.0 |

**不符合规范的提交**

| 提交 | 问题 |
|------|------|
| `迭代五至九：交易记录、GM工具、日志审计、角色管理` | 无类型前缀 |
| `迭代三：账号管理` | 无类型前缀 |
| `迭代二：认证与系统总览` | 无类型前缀 |
| `迭代一：基础框架搭建` | 无类型前缀 |
| `Initial commit` | 无类型前缀 |

---

### 维度 10：架构评估（13.5 / 18 分）

#### 分层架构（4.5 / 6.3 分）

```
+------------------+
|   Routes 层       |  薄路由，参数校验，调用 Service
+------------------+
         |
+------------------+
|  Services 层      |  厚服务，业务逻辑，缓存，SOAP
+------------------+
         |
+------------------+
| Repositories 层   |  仅 account.repository.ts 使用 TypeORM
+------------------+
         |
+------------------+
|  Entities 层      |  TypeORM 实体定义
+------------------+
```

**评估**：后端分层清晰，但 Repositories 层未充分利用（仅 account 使用 Repository 模式，其他 Service 直接执行 SQL）。前端 features/shared/pages 分层合理。

#### 模块内聚（4.0 / 5.4 分）

| 模块 | 内聚性 | 说明 |
|------|--------|------|
| backend/services | 高 | 每个 Service 职责单一 |
| backend/routes | 高 | 薄路由，仅 HTTP 处理 |
| backend/middleware | 高 | 每个中间件职责单一 |
| frontend/features | 中 | api + hooks 分离，但缺少 components |
| frontend/pages | 低 | 页面组件过大，混合 UI 和状态逻辑 |

#### 依赖管理（3.0 / 3.6 分）

- 无循环依赖
- 后端 Service 间通过实例导入协作
- 前端 features 不互相引用，通过 shared 层共享
- 依赖方向正确（上层依赖下层）

#### 设计模式（2.0 / 2.7 分）

| 模式 | 使用情况 | 评价 |
|------|---------|------|
| Repository Pattern | 部分使用 | 仅 account.repository.ts 实现 |
| Singleton | 广泛使用 | Service 导出单例实例 |
| Middleware Chain | 良好 | Express 中间件链清晰 |
| React Context | 使用 | AuthProvider 管理认证状态 |
| Custom Hooks | 良好 | TanStack Query 封装 |

---

## 三、综合评分

| 维度 | 权重 | 得分 | 加权得分 |
|------|------|------|---------|
| 文档质量 | 10% | 5.8 | 0.58 |
| 目录结构 | 10% | 7.0 | 0.70 |
| 代码规模 | 10% | 9.0 | 0.90 |
| 复杂度 | 12% | 9.5 | 1.14 |
| 代码健康度 | 10% | 2.0 | 0.20 |
| 依赖安全 | 7% | 4.9 | 0.34 |
| 测试质量 | 7% | 2.0 | 0.14 |
| 硬编码检测 | 8% | 6.8 | 0.54 |
| Git 提交规范 | 8% | 6.8 | 0.54 |
| 架构评估 | 18% | 13.5 | 2.43 |
| **合计** | **100%** | | **7.51 / 10** |

---

## 四、发现的问题

### 严重问题（High）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| H1 | **前端存在 Critical 依赖漏洞** | `frontend/package.json` | 安全风险 |
| H2 | **注释覆盖率极低**（Backend 0.54% / Frontend 0.13%） | 全项目 | 可维护性差 |
| H3 | **测试覆盖率极低**（仅 4 个测试文件） | 全项目 | 回归风险高 |
| H4 | **responseFormatter 扩展方法注册但未使用** | `backend/src/middleware/response-formatter.ts` | 代码冗余，设计意图未实现 |
| H5 | **前端路由缺少 GM 等级守卫** | `frontend/src/app/router.tsx` | 权限控制仅依赖后端，前端可被绕过 |

### 中等问题（Medium）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| M1 | **架构文档与代码严重不符**（Backend 缺失 9 个文件，Frontend 缺失 16 个文件） | `docs/arch/` | 文档误导 |
| M2 | **TypeScript `any` 滥用**（Backend 35 处） | 各 Service/Routes | 类型安全受损 |
| M3 | **前端重复代码**：raceMap/classMap 在 3 个页面重复定义 | `AccountDetailPage.tsx`, `CharacterListPage.tsx`, `CharacterDetailPage.tsx` | 维护负担 |
| M4 | **前端重复代码**：durationLabels 在 3 个页面重复定义 | `AccountDetailPage.tsx`, `CharacterDetailPage.tsx`, `IpBanPage.tsx` | 维护负担 |
| M5 | **前端重复代码**：banReasonOptions 在 3 个页面重复定义 | `AccountDetailPage.tsx`, `CharacterDetailPage.tsx`, `IpBanPage.tsx` | 维护负担 |
| M6 | **alert()/confirm() 直接调用**（11 处 alert，3 处 confirm） | 各 Page 组件 | 用户体验差，无法统一处理 |
| M7 | **Repositories 层未充分利用** | 仅 `account.repository.ts` 使用 TypeORM Repository | 架构设计未落实 |
| M8 | **前后端类型定义重复** | `frontend/src/features/account/types/account.types.ts` vs `backend/src/services/account.service.ts` | 维护负担 |
| M9 | **JWT_SECRET 存在默认值** | `backend/src/config/env.ts:89` | 生产环境若未配置则使用弱密钥 |

### 低等问题（Low）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| L1 | **JWT expiresIn 使用 `as any`** | `backend/src/services/auth.service.ts:45` | 类型安全 |
| L2 | **req 类型转换使用 `as any`** | 多个 routes 文件 | 应使用 AuthRequest 类型 |
| L3 | **Service 层 catch 块返回 false 而非抛出异常** | `account.service.ts`, `character.service.ts` | 错误信息丢失 |
| L4 | **缓存失效策略不一致** | 部分用 `delPattern`，部分用固定 key | 维护负担 |
| L5 | **audit-log.service.ts 直接 INSERT** | `backend/src/services/audit-log.service.ts:95` | 违反只读数据库策略（审计日志表除外） |
| L6 | **usePermission Hook 导出但未使用** | `frontend/src/shared/hooks/usePermission.ts` | 前端权限控制缺失 |
| L7 | **docker-compose.yml 缺少 depends_on** | `docker-compose.yml` | 服务启动顺序无保障 |

---

## 五、改进建议

### 1. 文档与代码一致性

- 更新架构文档，删除未实现的文件描述，或补充实现缺失文件
- 统一环境变量文档格式（连接串 vs 分字段）
- 在 README 中补充开发指南和贡献规范

### 2. 类型安全

- 将 `req as any` 替换为 `AuthRequest` 类型导入
- 为 Service 层 SQL 查询结果定义明确接口，替代 `any[]`
- 修复 `jwt.sign` 的 `expiresIn` 类型问题

### 3. 前端代码重构

- 提取 `raceMap`、`classMap`、`durationLabels`、`banReasonOptions` 到 `shared/constants/game.constants.ts`
- 将 alert/confirm 替换为统一的 Toast/Dialog 通知系统
- 在路由中添加 GM 等级守卫组件
- 使用 `usePermission` Hook 控制菜单和按钮显隐
- 拆分过大的 Page 组件（如 AccountDetailPage 546 行）

### 4. 后端架构优化

- 统一使用 Repository 模式或统一使用直接 SQL，避免混合
- 激活 `responseFormatter` 扩展方法的使用，替代手动 `res.json()`
- 为所有 Service 方法添加异常抛出机制，替代返回 false

### 5. 测试补充

- 为核心业务 Service 添加单元测试（account、character、transaction）
- 为关键路由添加 E2E 测试（auth、account、character）
- 为前端 hooks 添加单元测试

### 6. 安全加固

- 运行 `npm audit fix` 修复前端 Critical 漏洞
- 移除 JWT_SECRET 默认值，强制生产环境配置
- 定期更新依赖版本

### 7. 注释补充

- 为 SRP6 密码验证算法添加注释
- 为 SOAP 命令封装添加注释
- 为复杂的 SQL 查询添加注释说明业务意图

---

## 六、具体文件和问题行引用

### 严重问题

```
frontend/package.json          [H1] 存在 Critical 依赖漏洞
backend/src/middleware/response-formatter.ts  [H4] 已注册但未使用 jsonSuccess/jsonError
frontend/src/app/router.tsx    [H5] 缺少 GM 等级路由守卫（对比后端 31 处 requireGmLevel）
```

### 中等问题

```
backend/src/services/account.service.ts    [M2] line 92:  let params: any[] = []
backend/src/services/account.service.ts    [M2] line 131: items.map((item: any) => ({
backend/src/services/character.service.ts  [M2] line 63:  const params: any[] = []
backend/src/services/character.service.ts  [M2] line 102: items.map((item: any) => ({
backend/src/routes/account.routes.ts       [M2] line 116: (req as any).user?.id || 0
backend/src/routes/character.routes.ts     [M2] line 78:  (req as any).user?.id || 0
backend/src/routes/character.routes.ts     [M2] line 102: (req as any).user?.id || 0
backend/src/routes/character.routes.ts     [M2] line 131: (req as any).user?.id || 0
backend/src/routes/character.routes.ts     [M2] line 155: (req as any).user?.id || 0
backend/src/routes/ip-ban.routes.ts        [M2] line 56:  (req as any).user?.id || 0

frontend/src/pages/AccountDetailPage.tsx   [M3] line 13-22: raceMap/classMap 重复定义
frontend/src/pages/CharacterListPage.tsx   [M3] line 5-16:  raceMap/classMap 重复定义
frontend/src/pages/CharacterDetailPage.tsx [M3] line 12-21: raceMap/classMap 重复定义

frontend/src/pages/AccountDetailPage.tsx   [M4] line 34-40: durationLabels 重复定义
frontend/src/pages/CharacterDetailPage.tsx [M4] line 33-39: durationLabels 重复定义
frontend/src/pages/IpBanPage.tsx           [M4] line 15-21: durationLabels 重复定义

frontend/src/pages/AccountDetailPage.tsx   [M5] line 24-32: banReasonOptions 重复定义
frontend/src/pages/CharacterDetailPage.tsx [M5] line 23-31: banReasonOptions 重复定义
frontend/src/pages/IpBanPage.tsx           [M5] line 5-13:  banReasonOptions 重复定义

frontend/src/pages/AccountDetailPage.tsx   [M6] line 104,117,130: alert() 调用
frontend/src/pages/AccountDetailPage.tsx   [M6] line 114: confirm() 调用

backend/src/config/env.ts                  [M9] line 89: JWT_SECRET 默认值 'change-me-in-production'
```

### 低等问题

```
backend/src/services/auth.service.ts       [L1] line 45: { expiresIn: env.JWT_EXPIRES_IN as any }
backend/src/middleware/error-handler.ts    [L2] line 11: (err as any).status || 500
backend/src/middleware/request-logger.ts   [L2] line 26: (req as any).user?.username
backend/src/services/account.service.ts    [L3] line 267-269: catch 返回 false
backend/src/services/character.service.ts  [L3] line 218-221: catch 返回 false
backend/src/services/audit-log.service.ts  [L5] line 95: INSERT INTO acm_operation_logs
frontend/src/shared/hooks/usePermission.ts [L6] 导出但未在组件中引用
docker-compose.yml                         [L7] 缺少 depends_on 配置
```

---

*报告生成时间：2026/06/07*
*分析工具：代码质量分析技能（10 维度评估模型）*
