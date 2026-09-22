# Stage 1: Frontend build
# Use Debian-based image because rolldown (Vite 8 bundler) lacks musl native bindings
# node:22：deepagents 传递依赖 openai@7 要求 node>=22，且 npm 10.8(node20) 有 Exit handler never called 损坏安装 bug
FROM node:22 AS frontend-builder
WORKDIR /app/frontend

ARG VITE_APP_VERSION
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend build
FROM node:22-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY backend/ ./
RUN npm run build

# Stage 3: Production
FROM node:22-alpine AS production
WORKDIR /app
# Install fonts required by svg-captcha on Alpine Linux (Alpine 3.18+: ttf-dejavu → font-dejavu)
RUN apk add --no-cache fontconfig font-dejavu
COPY backend/package*.json ./
RUN npm ci --legacy-peer-deps --omit=dev && npm cache clean --force
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=frontend-builder /app/frontend/dist ./dist/public
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
EXPOSE 9000
CMD ["node", "dist/server.js"]
