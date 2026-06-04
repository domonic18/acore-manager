# AzerothCore Manager 需求文档

## 1. 项目概述

AzerothCore Manager（简称 ACM）是一个面向 AzerothCore 魔兽世界私服的**全端管理后台系统**，支持桌面端和移动端浏览器访问。它通过 Web 界面提供对游戏数据库和玩家数据的全面管理能力，让服务器管理员和 GM **随时随地**（包括通过手机、平板）完成日常管理工作。

**移动端定位**：GM 经常需要在游戏外快速处理突发事件（如在线玩家举报、紧急封禁、发放补偿物品），移动端支持让 GM 无需打开电脑即可响应。

## 2. 目标用户

| 角色 | 权限级别 | 主要职责 |
|------|---------|---------|
| 超级管理员 (Owner) | gmlevel = 4 | 服务器配置、账号管理、系统设置 |
| 管理员 (Admin) | gmlevel = 3 | 玩家管理、封禁解封、数据维护 |
| 游戏管理员 (GameMaster) | gmlevel = 2 | 在线GM、处理玩家问题、发放奖励 |
| 初级GM (Moderator) | gmlevel = 1 | 查看数据、举报处理 |

## 3. 功能需求

### 3.1 系统总览 Dashboard

**需求描述**：登录后首页，展示服务器核心运行指标。

**具体功能**：
- 实时在线玩家数量及列表
- 今日新增账号数
- 今日活跃账号数（有登录记录）
- 服务器运行时长（从 worldserver 启动时间计算）
- 最近的系统事件日志（登录、封禁、GM操作）

**数据来源**：
- `acore_auth.account` - 账号数据
- `acore_characters.characters` - 角色数据
- `acore_characters.online`（实际用 online=1 查询）

### 3.2 账号管理

**需求描述**：对游戏账号进行全面管理。

**具体功能**：
- **账号列表**：分页展示所有账号，支持按用户名/IP/邮箱搜索
- **账号详情**：查看账号基本信息、角色列表、登录历史、封禁记录
- **账号编辑**：修改密码、邮箱、GM等级、锁定状态
- **封禁管理**：
  - 对账号进行封禁（指定原因和时长）
  - 查看封禁历史
  - 提前解封
  - IP封禁（支持IP段）
- **登录日志**：查看账号的登录历史（时间、IP、结果）

**数据来源**：
- `acore_auth.account`
- `acore_auth.account_access`
- `acore_auth.account_banned`
- `acore_auth.ip_banned`
- `acore_auth.logs`（如果有）

### 3.3 角色管理

**需求描述**：管理游戏角色数据。

**具体功能**：
- **角色列表**：分页展示所有角色，支持按名称/账号/等级搜索
- **角色详情**：查看完整角色信息
  - 基础属性（等级、经验、金币、荣誉等）
  - 装备列表
  - 背包物品
  - 技能列表
  - 任务进度
  - 声望列表
  - 竞技场战队
  - 交易记录（金币流向、交易时间、交易对象、交易类型）
- **角色操作**：
  - 改名
  - 定制外观
  - 转阵营/转种族
  - 传送（指定地图坐标）
  - 卡死恢复（传送到主城）
  - 恢复已删除角色
- **交易记录查询**：
  - 按角色名称搜索交易记录（支持发送方/接收方双向查询）
  - 按交易对象搜索
  - 按时间范围筛选
  - 交易类型筛选（玩家交易、邮件、COD货到付款、拍卖行、公会银行存入/取出）
  - 按金币数额范围筛选

**数据来源**：
- `acore_characters.characters`
- `acore_characters.character_inventory`
- `acore_characters.item_instance`
- `acore_characters.character_skills`
- `acore_characters.character_queststatus`
- `acore_characters.character_reputation`
- `acore_characters.arena_team`
- `acore_characters.arena_team_member`
- `acore_characters.log_money`（核心交易日志，记录金币交易历史：玩家交易TRADE/邮件MAIL/COD货到付款/拍卖行AUCTION/公会银行GUILD_BANK，需 worldserver 开启 `LogMoneyTradesChatLog`）
- `acore_characters.mail` / `mail_items`（补充邮件物品详情）
- `acore_characters.auctionhouse`（补充当前进行中的拍卖信息）

### 3.4 GM 工具

**需求描述**：GM日常操作工具集。

**具体功能**：
- **在线GM面板**：显示当前在线的GM列表
- **广播消息**：向全服/指定玩家发送系统消息
- **坐骑/宠物发放**
- **称号管理**
- **查找玩家**：按名称/账号/IP查找在线玩家

**实现方式**：
- 直接操作数据库（适用于离线操作）
- 通过 SOAP/RA 接口发送GM命令（适用于在线操作）
- 通过 worldserver 控制台命令

### 3.5 日志与审计

**需求描述**：操作日志记录和查询。

**具体功能**：
- **GM操作日志**：记录所有GM的后台操作
- **登录日志**：账号登录历史
- **异常日志**：错误和异常记录
- **日志筛选**：按时间/操作人/操作类型筛选

## 4. 非功能需求

### 4.1 安全性
- 所有API必须JWT认证
- GM等级权限校验（不同级别访问不同功能）
- 敏感操作（封禁、删除、修改配置）需要二次确认
- 密码使用 AzerothCore 标准 SHA1 哈希
- SQL注入防护（使用参数化查询）
- 请求频率限制

### 4.2 性能
- 列表查询支持分页（默认20条/页）
- 大数据表查询使用索引
- 连接池配置
- 前端数据缓存策略

### 4.3 可用性
- 响应式设计（支持不同屏幕尺寸）
- 操作成功/失败提示
- 加载状态显示
- 表单验证提示

### 4.4 扩展性
- 模块化设计，方便新增功能
- API版本控制
- 插件化GM命令支持

## 5. 技术栈选型

本项目后端技术栈参考 `acore-ranking` 项目，保持技术一致性，降低维护成本。

### 5.1 后端技术栈

| 层级 | 技术选型 | 版本 | 说明 |
|------|---------|------|------|
| 运行时 | Node.js | >= 20.0.0 | 与 acore-ranking 保持一致 |
| Web 框架 | Express | ^4.21.0 | 轻量、成熟、社区丰富 |
| 数据库 ORM | TypeORM | ^0.3.20 | 支持多数据源（auth/characters/world） |
| 数据库驱动 | mysql2 | ^3.11.3 | 连接 AzerothCore MySQL 数据库 |
| 缓存 | ioredis | ^5.4.1 | Redis 缓存，支持 TTL 策略 |
| 日志 | pino + pino-pretty | ^9.4.0 | 高性能结构化日志 |
| 验证 | express-validator | ^7.2.0 | 请求参数校验 |
| 安全 | helmet | ^7.1.0 | HTTP 安全头 |
| 跨域 | cors | ^2.8.5 | 跨域支持 |
| 环境变量 | dotenv | ^16.4.5 | 配置管理 |
| 开发语言 | TypeScript | ^5.6.2 | 类型安全 |
| 测试 | jest + supertest | ^29.7.0 | 单元测试与 E2E 测试 |
| 代码质量 | ESLint + Prettier | ^9.11.1 | 代码规范 |

### 5.2 前端技术栈

| 层级 | 技术选型 | 版本 | 说明 |
|------|---------|------|------|
| 框架 | React | ^18.3.1 | 组件化 UI 开发 |
| 构建工具 | Vite | ^5.4.8 | 快速开发与构建 |
| 路由 | react-router-dom | ^6.26.2 | 单页应用路由 |
| 数据请求 | TanStack Query | ^5.56.2 | 服务端状态管理、缓存、自动重试 |
| 表格 | TanStack Table | ^8.20.5 | 高性能数据表格 |
| UI 组件 | shadcn/ui | - | 基于 Radix UI 的无头组件 |
| 样式 | Tailwind CSS | ^3.4.13 | 原子化 CSS |
| 动画 | tailwindcss-animate | ^1.0.7 | Tailwind 动画插件 |
| 图标 | lucide-react | ^0.447.0 | 图标库 |
| 工具类 | clsx + tailwind-merge | - | 类名条件合并 |
| 开发语言 | TypeScript | ^5.6.2 | 类型安全 |
| 测试 | vitest | ^2.1.1 | 单元测试 |

### 5.3 部署架构

#### 5.3.1 单一 Docker 镜像

前后端统一构建为一个 Docker 镜像，方便部署和运维：

- **前端构建**：Vite 构建输出静态资源（`dist/` 目录）
- **后端构建**：TypeScript 编译为 JavaScript（`dist/` 目录）
- **镜像组装**：前端构建产物复制到 `backend/dist/public`，由 Express 静态中间件统一 serve
- **运行方式**：单容器运行 Node.js 服务，同时提供 API 和前端页面

**优势**：
- 简化部署流程，仅需一个镜像
- 降低云资源成本（单实例运行）
- 避免前后端跨域问题
- 与 `acore-ranking` 部署方式保持一致

#### 5.3.2 腾讯云函数（SCF）部署

Docker 镜像设计需兼容腾讯云函数 SCF 部署：

- **端口**：统一使用 `9000` 端口（腾讯云 SCF 默认监听端口）
- **镜像格式**：标准 OCI 镜像，基于 `node:20-alpine`
- **无状态设计**：应用层无状态，配置通过环境变量注入
- **启动速度**：构建产物为编译后的 JS + 静态资源，无需运行时 TS 编译
- **健康检查**：提供 `/health` 健康检查接口
- **日志输出**：使用 pino 输出结构化 JSON 日志，兼容腾讯云日志采集

**CI/CD 流程**：
1. GitHub Actions 触发构建
2. Docker 多阶段构建（前端 → 后端 → 生产镜像）
3. 推送至腾讯云容器镜像服务（TCR）
4. 自动部署至腾讯云函数 SCF

## 6. 技术约束

- 必须兼容 AzerothCore 数据库结构
- 不修改核心表结构（只读或可配置字段）
- 支持多 realm 配置
- 与现有 acore-api 不冲突（使用不同端口）
- Docker 镜像必须可在腾讯云 SCF 环境正常运行
