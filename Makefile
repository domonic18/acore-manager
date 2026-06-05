.PHONY: build up down logs dev install

build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f app

dev-backend:
	cd backend && npm run dev

dev-frontend:
	cd frontend && npm run dev

install-backend:
	cd backend && npm install

install-frontend:
	cd frontend && npm install

install: install-backend install-frontend
