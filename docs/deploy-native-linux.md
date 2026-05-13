# 不使用 Docker：在 Linux（含阿里云 ECS）上原生部署

适用于 **无法安装 Docker / Compose** 的环境：在机器上自行安装 **MySQL 8**、**Redis 7**、**Node.js 20**、**Nginx**，按本文启动后端进程并托管前端静态资源。

与 Docker 方案对比：**步骤更多**，但无需容器运行时；逻辑与 `docker-compose.yml` 描述的组件一致。

若可使用 Docker，仍推荐 **[deploy-aliyun-ecs.md](./deploy-aliyun-ecs.md)**。

**正式环境同源域名（ECS + Nginx + HTTPS + GitHub 发版）：** **[deploy-same-origin-production.md](./deploy-same-origin-production.md)**。

---

## 一、架构（原生）

| 组件 | 角色 |
|------|------|
| **Nginx** | 监听 **80/443**，托管前端 `dist`，并把 **`/api/`、`/ws/`、`/uploads/`** 反代到本机后端 |
| **Node（后端）** | `backend` 目录：`npm run build` → `npm run start`，默认端口 **4000** |
| **MySQL 8** | 存储业务数据；首次执行仓库 **`database/init/`** 下 SQL |
| **Redis 7** | 缓存、限流、**BullMQ 报告队列**（必需，否则报告会一直排队） |

数据库也可用 **阿里云 RDS**、缓存用 **阿里云 Redis**，只要把 `.env` 里的 **`MYSQL_*` / `REDIS_*`** 改成云实例地址（安全组放行后端 ECS 访问）。

---

## 二、系统依赖（以 Ubuntu 22.04 为例）

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg build-essential nginx

# Node.js 20.x（使用 NodeSource；亦可改用 nvm）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

node -v   # v20.x
nginx -v
```

安装数据库与 Redis：

```bash
sudo apt-get install -y mysql-server redis-server
sudo systemctl enable --now mysql redis-server
```

---

## 三、MySQL：建库并导入初始化脚本

```bash
sudo mysql -u root <<'SQL'
CREATE DATABASE IF NOT EXISTS coldhero
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'coldhero'@'localhost' IDENTIFIED BY '请改成强密码';
GRANT ALL PRIVILEGES ON coldhero.* TO 'coldhero'@'localhost';
FLUSH PRIVILEGES;
SQL
```

将仓库 **`database/init/01_schema.sql`**、**`database/init/02_seed.sql`** 按顺序导入（路径按你放置代码的位置修改）：

```bash
cd /opt/coldhero   # 示例路径

sudo mysql -u root coldhero < database/init/01_schema.sql
sudo mysql -u root coldhero < database/init/02_seed.sql
```

若 `01_schema.sql` 里已包含 `CREATE DATABASE`，上面预先建库可省略；保证最终在 **`coldhero`** 库中建表成功即可。

---

## 四、后端配置与启动

### 4.1 目录与 `.env`

假设代码在 **`/opt/coldhero`**：

```bash
sudo mkdir -p /opt/coldhero/backend/storage/{uploads,fonts,forecasts}
sudo chown -R $USER:$USER /opt/coldhero/backend/storage
```

将 **`/.env.example`** 复制为 **`/opt/coldhero/backend/.env`**（后端进程的工作目录为 **`backend`**，`dotenv` 从这里加载）。

```bash
cp /opt/coldhero/.env.example /opt/coldhero/backend/.env
nano /opt/coldhero/backend/.env
```

### 4.2 必须对齐的变量（原生典型值）

| 变量 | 说明 |
|------|------|
| **`MYSQL_HOST`** | 本机：`127.0.0.1`；RDS：实例地址 |
| **`MYSQL_PORT`** | 默认 `3306` |
| **`MYSQL_USER`** / **`MYSQL_PASSWORD`** | 与上文 MySQL 用户一致 |
| **`MYSQL_DATABASE`** | `coldhero` |
| **`REDIS_HOST`** | 本机：`127.0.0.1`；云 Redis：控制台给出的连接地址 |
| **`REDIS_PASSWORD`** | 云 Redis 有密码则填写 |
| **`JWT_SECRET`** | ≥16 位随机串 |
| **`AI_API_KEY`** | DeepSeek / 通义等 |

生产建议 **`APP_ENV=production`**。

**CORS：** **`APP_CORS_ORIGINS`** 填浏览器实际访问地址（含协议与端口），多个用英文逗号分隔，例如：

```env
APP_CORS_ORIGINS=http://你的ECS公网IP,https://你的域名
```

**预测 CSV：** `FORECAST_CSV_DIR` 若不设置，后端默认使用 **`当前工作目录/storage/forecasts`**（在 `backend` 目录启动时即 **`backend/storage/forecasts`**）。可选在 `.env` 里写成绝对路径：

```env
FORECAST_CSV_DIR=/opt/coldhero/backend/storage/forecasts
```

**PDF 中文字体：** 将 **`.otf`** 字体放到 **`backend/storage/fonts/`**（见 `.env.example` 说明）。

### 4.3 安装依赖、构建、进程守护

```bash
cd /opt/coldhero/backend
npm ci
npm run build
```

**种子密码（首次必做一次）：** 脚本依赖 `tsx`，可用 `npx` 一次性执行（无需全局安装）：

```bash
cd /opt/coldhero/backend
npx --yes tsx src/scripts/seedPasswords.ts
```

完成后演示账号密码见根目录 **README.md**（默认 **`Coldhero@123`**）。

**启动后端（前台调试）：**

```bash
cd /opt/coldhero/backend
npm run start
```

**推荐：使用 systemd**（开机自启）。创建 **`/etc/systemd/system/coldhero-backend.service`**：

```ini
[Unit]
Description=ColdHero API (Node)
After=network.target mysql.service redis-server.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/coldhero/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

按实际用户调整 **`User`**；确保 **`WorkingDirectory`** 与 **`backend/.env`**、**`storage/`** 权限对该用户可读可写。

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now coldhero-backend
sudo systemctl status coldhero-backend
curl -s http://127.0.0.1:4000/api/health/deep
```

---

## 五、前端构建

```bash
cd /opt/coldhero/frontend
npm ci
npm run build
```

产物目录：**`frontend/dist`**。

前端 axios **`baseURL` 为 `/api`**，只要与用户浏览器访问的站点 **同源**（同一域名端口），由 Nginx 反代即可，**一般不必设置 `VITE_API_BASE_URL`**。

---

## 六、Nginx：静态站点 + 反代 API / WebSocket / Uploads

新建站点配置（示例 **`/etc/nginx/sites-available/coldhero`**）：

```nginx
server {
    listen 80;
    server_name _;

    root /opt/coldhero/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        chunked_transfer_encoding on;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 7d;
        proxy_send_timeout 7d;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;
}
```

启用并重载：

```bash
sudo ln -sf /etc/nginx/sites-available/coldhero /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**说明：** 未配置阿里云 OSS 时，PDF/图片 URL 为 **`/uploads/...`**，必须由 Nginx 转到后端；否则浏览器拿不到文件。

**安全组：** 公网只放行 **80 / 443**（及受限的 **22**）；MySQL、Redis、后端 **4000** 不必对公网开放。

---

## 七、HTTPS（可选）

使用 Let’s Encrypt（**certbot**）或阿里云 **SSL 证书** + Nginx `listen 443 ssl`，并把 **`APP_CORS_ORIGINS`** 改为 **`https://你的域名`**。

---

## 八、阿里云 OSS（可选）

与 Docker 方案相同：在 **`backend/.env`** 填写 **`ALI_OSS_*`**，详见 **`.env.example`**。启用 OSS 后，文件 URL 为外链，可不依赖本机 **`/uploads/`** 反代（仍建议保留反代段以备混合场景）。

---

## 九、运维小结

| 操作 | 命令 |
|------|------|
| 后端日志 | `journalctl -u coldhero-backend -f` |
| 重启后端 | `sudo systemctl restart coldhero-backend` |
| 更新代码 | `git pull` → `backend`: `npm ci && npm run build` → `systemctl restart`；`frontend`: `npm ci && npm run build` → `nginx reload` |

---

## 十、常见问题

| 现象 | 处理 |
|------|------|
| 报告一直 queued | 确认 **Redis** 已启动且 **`REDIS_*`** 正确；后端日志是否有 BullMQ 报错 |
| CORS 错误 | 检查 **`APP_CORS_ORIGINS`** 是否与浏览器地址栏完全一致（协议、域名、端口） |
| PDF 打不开 | Nginx 是否配置了 **`location /uploads/`**；或改用 OSS |
| `npm run build` 报错（bcrypt 等） | 安装 **`build-essential`**，必要时安装 **`python3`** |

本文与 **[deploy-aliyun-ecs.md](./deploy-aliyun-ecs.md)** 互为补充：同一套应用，仅运行时安装方式不同。
