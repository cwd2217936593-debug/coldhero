# =============================================================
# 冷库智能监管平台 - 后端 Dockerfile（多阶段构建）
# =============================================================

# ---- Stage 1: 构建 ----
FROM node:20-alpine AS builder
WORKDIR /app

# 仅复制依赖清单，利用 Docker 缓存
COPY package.json ./
RUN npm install --no-audit --no-fund

# 复制源码并构建
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Stage 2: 运行时 ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# 仅装生产依赖
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 复制构建产物
COPY --from=builder /app/dist ./dist

# 报告等运行期文件目录
RUN mkdir -p /app/storage/reports

EXPOSE 4000
CMD ["node", "dist/server.js"]
