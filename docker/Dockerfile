# Stage 1: Frontend build
# Use Debian-based image because rolldown (Vite 8 bundler) lacks musl native bindings
FROM node:20 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend build
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY backend/ ./
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app
# Install fonts required by svg-captcha on Alpine Linux
RUN apk add --no-cache fontconfig ttf-dejavu
COPY backend/package*.json ./
RUN npm ci --legacy-peer-deps --omit=dev && npm cache clean --force
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=frontend-builder /app/frontend/dist ./dist/public
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
EXPOSE 9000
CMD ["node", "dist/server.js"]
