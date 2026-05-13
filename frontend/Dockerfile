# =============================================================
# 冷库智能监管平台 - 前端 Dockerfile
# =============================================================

# ---- Stage 1: 构建 ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY src ./src
COPY public ./public
# 构建期注入（与 frontend/.env.production 对齐；镜像内未复制该文件时也保证生产构建不走 Mock）
ARG VITE_USE_MOCK=0
ARG VITE_API_BASE_URL=
ENV VITE_USE_MOCK=$VITE_USE_MOCK
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---- Stage 2: nginx 静态托管 + 反代 ----
FROM nginx:1.27-alpine AS runtime
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
