# AzerothCore Manager

AzerothCore Manager（ACM）是一个面向 AzerothCore 魔兽世界私服的**全端管理后台系统**，支持桌面端和移动端浏览器访问。

通过 Web 界面提供对游戏数据库和玩家数据的全面管理能力，让服务器管理员和 GM **随时随地**（包括通过手机、平板）完成日常管理工作。

## 技术栈

### 前端
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- TanStack Query + TanStack Table

### 后端
- Node.js 20 + Express + TypeScript
- TypeORM（多数据源：auth/characters/world）
- Redis（缓存与会话）

### 部署
- Docker（单一镜像，前后端合一）
- 兼容腾讯云 SCF Web 容器

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/domonic18/acore-manager.git
cd acore-manager

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入数据库、Redis、JWT、SOAP 连接信息

# 3. 本地启动（Docker Compose）
docker-compose up --build -d

# 4. 访问
open http://localhost:9000
```

## 文档

| 文档 | 说明 |
|------|------|
| [需求文档](docs/requirements/requirements.md) | 功能需求与非功能需求 |
| [整体架构](docs/arch/01整体架构.md) | 系统架构、技术选型、权限设计 |
| [后端架构](docs/arch/02后端架构.md) | 后端技术实现、API 设计、核心时序图 |
| [前端架构](docs/arch/03前端架构.md) | 前端技术实现、组件设计、路由配置 |
| [部署架构](docs/arch/04部署架构.md) | Docker 构建、SCF 部署、CI/CD |
| [数据库操作规范](docs/standard/数据库操作规范.md) | 系统只读数据库，写操作走 SOAP |

## License

MIT
