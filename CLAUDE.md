# acore-manager Project Context

## Project Overview

AzerothCore Manager (ACM) is a full-stack admin dashboard for AzerothCore private servers. Supports both desktop and mobile browsers for on-the-go GM operations.

Replaces ad-hoc database queries and direct worldserver console access with a unified web interface.

## Architecture

- **Monolithic container**: Single Docker image serves both API and static files via Express
- **Backend**: Express + TypeORM (multi-DB: auth/characters/world read-only MySQL + acm writable PostgreSQL) + ioredis + pino + JWT auth
- **Frontend**: React 18 + Vite + TanStack Query/Table + Tailwind CSS + shadcn/ui

## Key Design Decisions

1. **Single Docker image**: Frontend build output copied to `backend/dist/public`, served by Express static middleware
2. **Read-only database policy**: All data mutations go through SOAP commands to worldserver; direct DB writes are prohibited
3. **JWT + GM level guard**: Auth uses AzerothCore's native `gmlevel` from `account_access` table; no separate RBAC system
4. **Mobile-first GM tools**: Sidebar collapsible layout, key operations (ban/unban, player search) optimized for phone screens
5. **API response format**: `{success, count, data}` consistent with acore-ranking

## Directory Structure

> Canonical standard: `docs/standard/代码目录结构规范.md` — every file must have exactly one home there; new top-level or domain-group directories require updating that doc first. Experimental code goes to `backend/poc/` (excluded from build, never imported by `src/`).

- `backend/src/routes/`: Thin HTTP routes only (validation + guards + service call); AI domain uses flat `ai-*.routes.ts` naming
- `backend/src/services/`: Thick business logic, SOAP command execution, cache management; AI domain grouped under `services/ai/`
- `backend/src/agent/`: AI Agent runtime mechanics (core/runtime/tools/prompts/skills), separated from business orchestration; never imports `services/`
- `backend/src/entities/`: TypeORM entities grouped by datasource (`auth/characters/world` read-only + `acm/` writable)
- `backend/src/repositories/`: TypeORM query encapsulation (SELECT only)
- `backend/src/middleware/`: JWT auth, GM level guard, audit logger
- `frontend/src/features/`: Feature-based organization, per-feature subset `{api, hooks, types, components}` only; no cross-feature imports
- `frontend/src/pages/`: Page shells only (~100 lines max); logic sinks into features
- `frontend/src/shared/`: Cross-feature utilities (requires ≥2 consumers), API client, permission hooks, components

## Environment

- Node.js 22+ (Docker images use node:22-alpine; deepagents transitive dep openai@7 requires node>=22)
- Port: 9000 (Tencent Cloud SCF default)
- MySQL 8+ (read-only connections to AzerothCore databases)
- PostgreSQL (writable `acm` database: model config / AI sessions / reports / audits / LangGraph checkpoints)
- Redis 7+ (caching with TTL; plain Redis without modules — checkpoint savers must not require RedisJSON/RediSearch)
- SOAP port: 7878 (worldserver remote admin)

## Development Workflow

- Main branch: `develop`
- CI/CD: GitHub Actions → Docker build → TCR → SCF deploy
- Commit messages: bilingual (English / Chinese)
