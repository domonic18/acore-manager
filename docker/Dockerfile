# Stage 1: Frontend build
FROM node:20-alpine AS frontend-builder
ARG VITE_ICON_BASE_URL
ARG VITE_AOWOW_BASE_URL
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend build
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=frontend-builder /app/frontend/dist ./dist/public
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
EXPOSE 9000
CMD ["node", "dist/server.js"]
