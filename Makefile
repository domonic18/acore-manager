.PHONY: build up down logs dev install lint test typecheck

# Docker（compose v2）
build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f app

# 本地开发
dev-backend:
	cd backend && npm run dev

dev-frontend:
	cd frontend && npm run dev

install-backend:
	cd backend && npm install

install-frontend:
	cd frontend && npm install

install: install-backend install-frontend

# 质量门禁
lint:
	cd backend && npm run lint
	cd frontend && npm run lint

typecheck:
	cd backend && npm run typecheck
	cd frontend && npx tsc --noEmit

test:
	cd backend && npm test
	cd frontend && npm test
