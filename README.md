# AzerothCore Manager

AzerothCore Manager（ACM）是一个面向 AzerothCore 魔兽世界私服的**全端管理后台系统**，支持桌面端和移动端浏览器访问。

通过 Web 界面提供对游戏数据库和玩家数据的全面管理能力，让服务器管理员和 GM **随时随地**（包括通过手机、平板）完成日常管理工作。内置 AI 巡检诊断（deepagents Agent 运行时）：定时体检服务器、生成健康报告、可疑玩家处置与警告邮件。

## 技术栈

### 前端
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- TanStack Query + TanStack Table + Vitest

### 后端
- Node.js 22 + Express + TypeScript
- TypeORM（多数据源：auth/characters/world 只读 MySQL + acm 可写 PostgreSQL）
- Redis（缓存与会话）
- deepagents + LangChain（AI 巡检 Agent 运行时）
- Jest（单元/e2e 测试）

### 部署
- Docker（单一镜像，前后端合一；巡检 Job 独立镜像）
- 兼容腾讯云 SCF Web 容器，TCR 镜像仓库
- GitHub Actions CI/CD

## 数据源

| 数据源 | 类型 | 读写 | 用途 |
|--------|------|------|------|
| acore_auth / acore_characters / acore_world | MySQL 8+ | 只读 | AzerothCore 游戏数据；所有写操作经 SOAP 命令 |
| acm | PostgreSQL | 可写 | 模型配置 / AI 会话 / 巡检报告 / 审计日志 / LangGraph checkpoint |
| Redis 7+ | - | 读写 | 热点缓存 |

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/domonic18/acore-manager.git
cd acore-manager

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入数据库、Redis、JWT、SOAP 连接信息
# 注意：生产环境必须显式设置 JWT_SECRET / LLM_AES_KEY，否则启动即失败（fail-fast）

# 3. 本地启动（Docker Compose）
docker-compose up --build -d

# 4. 访问
open http://localhost:9000
```

## 开发指南

环境要求：Node.js >= 22.0.0

```bash
# 后端（backend/）
npm install
npm run dev              # tsx watch 热重载启动 :9000
npm test                 # Jest 单元 + e2e
npm run typecheck        # tsc --noEmit
npm run lint
npm run db:migrate       # acm 库 PostgreSQL 迁移

# 前端（frontend/）
npm install --legacy-peer-deps
npm run dev              # Vite dev server
npm test                 # Vitest
npx tsc --noEmit         # 类型检查
npm run lint
npm run build            # tsc && vite build
```

## 文档

| 文档 | 说明 |
|------|------|
| [需求文档](docs/requirements/requirements.md) | 功能需求与非功能需求 |
| [整体架构](docs/arch/01整体架构.md) | 系统架构、技术选型、权限设计 |
| [后端架构](docs/arch/02后端架构.md) | 后端技术实现、API 设计、核心时序图 |
| [前端架构](docs/arch/03前端架构.md) | 前端技术实现、组件设计、路由配置 |
| [部署架构](docs/arch/04部署架构.md) | Docker 构建、SCF 部署、环境变量 |
| [CI 设计](docs/arch/05CI设计.md) | GitHub Actions 流水线、双镜像构建与推送 |
| [AI 诊断与 Agent 架构](docs/arch/06AI诊断与Agent架构.md) | deepagents 运行时、巡检编排、误报防控 |
| [数据库操作规范](docs/standard/数据库操作规范.md) | 系统只读数据库，写操作走 SOAP |
| [代码目录结构规范](docs/standard/代码目录结构规范.md) | 前后端目录组织唯一标准 |

## License

[MIT](LICENSE)
