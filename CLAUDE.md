# acore-manager Project Context

## Project Overview

AzerothCore Manager (ACM) is a full-stack admin dashboard for AzerothCore private servers. Supports both desktop and mobile browsers for on-the-go GM operations.

Replaces ad-hoc database queries and direct worldserver console access with a unified web interface.

## Architecture

- **Monolithic container**: Single Docker image serves both API and static files via Express
- **Backend**: Express + TypeORM (multi-DB: auth/characters/world) + ioredis + pino + JWT auth
- **Frontend**: React 18 + Vite + TanStack Query/Table + Tailwind CSS + shadcn/ui

## Key Design Decisions

1. **Single Docker image**: Frontend build output copied to `backend/dist/public`, served by Express static middleware
2. **Read-only database policy**: All data mutations go through SOAP commands to worldserver; direct DB writes are prohibited
3. **JWT + GM level guard**: Auth uses AzerothCore's native `gmlevel` from `account_access` table; no separate RBAC system
4. **Mobile-first GM tools**: Sidebar collapsible layout, key operations (ban/unban, player search) optimized for phone screens
5. **API response format**: `{success, count, data}` consistent with acore-ranking

## Directory Structure

- `backend/src/routes/`: Thin HTTP routes only
- `backend/src/services/`: Thick business logic, SOAP command execution, cache management
- `backend/src/repositories/`: TypeORM query encapsulation (SELECT only)
- `backend/src/middleware/`: JWT auth, GM level guard, audit logger
- `frontend/src/features/`: Feature-based organization (dashboard/account/character/transaction/gm-tool/audit-log)
- `frontend/src/shared/`: Cross-feature utilities, API client, permission hooks, components

## Environment

- Node.js 20+
- Port: 9000 (Tencent Cloud SCF default)
- MySQL 8+ (read-only connections to AzerothCore databases)
- Redis 7+ (caching with TTL)
- SOAP port: 7878 (worldserver remote admin)

## Development Workflow

- Main branch: `develop`
- CI/CD: GitHub Actions → Docker build → TCR → SCF deploy
- Commit messages: bilingual (English / Chinese)
