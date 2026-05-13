# 正式环境：同源域名部署（阿里云 ECS + Nginx + GitHub）

本文说明如何把 **前端静态资源与后端 API 部署在同一入口域名下**（例如 **`https://app.example.com`**），浏览器继续使用 **`/api`、`/ws`、`/uploads`**，与仓库内 **`frontend/nginx.conf`**、Docker 前端容器的设计一致：**无需修改 `frontend/src/api/client.ts`**，也无需在 Vercel 上对正式域名做 API 反代。

适合：**中小团队正式站**；GitHub 仍作为代码源，ECS 上 `git pull` 构建发布；**Vercel 仅作预览**（`*.vercel.app`），正式业务 DNS **指向阿里云**。

**相关文档：**

- Docker 单机：**[deploy-aliyun-ecs.md](./deploy-aliyun-ecs.md)**
- 无 Docker 原生：**[deploy-native-linux.md](./deploy-native-linux.md)**
- 宿主机 Nginx 配置示例：**[nginx-app.example.conf](./nginx-app.example.conf)**

---

## 一、目标架构

| 项目 | 说明 |
|------|------|
| 用户访问 | **`https://app.你的域名.com`**（子域可自定，下文以 `app` 为例） |
| Nginx | **443/80**：静态 **`frontend/dist`**；**`/api/`、`/ws/`、`/uploads/`** → **`127.0.0.1:4000`** |
| 后端 | 监听 **`4000`**（Docker 映射或 systemd，见上文两篇部署文档） |
| 前端构建 | **`VITE_USE_MOCK=0`**，同源下一般**不必**设置 `VITE_API_BASE_URL` |
| Vercel | 仅预览；**正式域名 A 记录不要指向 Vercel** |

---

## 二、前置条件

1. **阿里云 ECS** 已按 **[deploy-aliyun-ecs.md](./deploy-aliyun-ecs.md)** 或 **[deploy-native-linux.md](./deploy-native-linux.md)** 跑通 MySQL、Redis、后端。
2. **域名**；规划子域 **`app`**（或 `www`）。
3. **安全组**：入站放行 **`443`、`80`**（及来源受限的 **`22`**）；**勿对公网开放 `3306`、`6379`**。
4. 后端已在本机 **`127.0.0.1:4000`** 提供服务。

---

## 三、DNS（正式环境）

在域名 DNS 控制台新增：

| 类型 | 主机记录 | 记录值 |
|------|----------|--------|
| **A** | `app` | **ECS 公网 IPv4** |

等待解析生效。

**注意：** 正式业务用的 **`app`** 记录应指向 **ECS**，不要与 **Vercel** 的 CNAME/A 冲突。预览继续使用 Vercel 提供的 **`*.vercel.app`** 即可。

---

## 四、后端环境变量（CORS）

后端 **`backend/.env`**（或 Compose 挂载的 `.env`）中设置：

```env
APP_CORS_ORIGINS=https://app.你的域名.com
```

多个前端来源用 **英文逗号** 分隔，与浏览器地址栏 **协议 + 主机 + 端口** 完全一致。

修改后重启后端（或 `docker compose restart backend`）。

---

## 五、前端生产构建

仓库 **`frontend/.env.production`** 已默认 **`VITE_USE_MOCK=0`**，`vite build` 会自动加载；ECS 上可直接：

```bash
cd /path/to/coldhero/frontend
npm ci
npm run build
```

无需每次手写 `VITE_USE_MOCK=0`。若需在特定环境临时打开 Mock，可在构建前导出 **`VITE_USE_MOCK=1`**（会覆盖文件中的值，依 Vite 与环境而定）。

**与 Vercel 的关系：** 根目录 **`vercel.json`** 的 **`build.env.VITE_USE_MOCK=1`** 在 Vercel 构建环境中优先存在，预览构建仍为 Mock，不会被 `.env.production` 关掉。

产物目录：**`frontend/dist`**。

---

## 六、安装 Nginx 与 HTTPS（Ubuntu 示例）

```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

**在 DNS 已指向本机**后申请证书：

```bash
sudo certbot --nginx -d app.你的域名.com
```

按提示完成 HTTPS；certbot 会在站点配置中写入证书路径，或将 HTTP 重定向到 HTTPS。

---

## 七、Nginx 站点配置

可直接复制仓库 **`docs/nginx-app.example.conf`**，将占位符 **`APP_DOMAIN`**、**`DIST_ROOT`**（一般为 **`/opt/coldhero/frontend/dist`**）替换为实际值；后端端口若非 **4000**，一并修改 **`upstream`**。

亦可手动新建 **`/etc/nginx/sites-available/coldhero-app`**（路径自定），将 **`server_name`**、**`root`**、证书路径换成你的实际值。

逻辑与仓库 **`frontend/nginx.conf`** 一致，仅反代目标为本机 **`127.0.0.1:4000`**：

```nginx
server {
    listen 443 ssl http2;
    server_name app.你的域名.com;

    # 若未用 certbot，请手动填写：
    # ssl_certificate     /etc/letsencrypt/live/app.你的域名.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/app.你的域名.com/privkey.pem;

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
        proxy_set_header X-Forwarded-Proto $scheme;
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
    gzip_min_length 1024;
}
```

启用并重载：

```bash
sudo ln -sf /etc/nginx/sites-available/coldhero-app /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 八、权限与目录

- Nginx 需能读取 **`frontend/dist`**（常见用户 **`www-data`**）。
- 后端需对 **`backend/storage/uploads`**（及字体、预测目录等）具备读写权限。

示例：

```bash
sudo chown -R www-data:www-data /opt/coldhero/frontend/dist
# 若由部署用户构建 dist，也可保留属主为该用户并 chmod -R g+rX，再将 Nginx 用户加入同组
```

---

## 九、手工发版流程（每次更新）

假设代码在 **`/opt/coldhero`**：

```bash
cd /opt/coldhero
git pull origin main

# 后端（有变更时）
cd backend
npm ci && npm run build
sudo systemctl restart coldhero-backend
# 若使用 Docker Compose：
# docker compose up -d --build backend

cd ../frontend
npm ci && npm run build

sudo systemctl reload nginx
```

自检：

```bash
curl -sI https://app.你的域名.com/api/health
curl -s https://app.你的域名.com/api/health/deep
```

浏览器访问 **`https://app.你的域名.com`**，验证登录、仪表盘 WebSocket、报告 PDF（本地存储时需 **`/uploads/`** 反代）。

---

## 十、可选：GitHub Actions 自动 SSH 部署

1. 在 ECS 上为部署创建 **SSH 密钥对**，公钥写入部署用户的 **`~/.ssh/authorized_keys`**。
2. 在 GitHub 仓库 **Settings → Secrets** 中保存：**私钥、`HOST`、`USER`**（及可选 `SSH_PORT`）。
3. 工作流触发条件：`push` 到 **`main`**（或你的发布分支）。
4. 步骤示例：`ssh` 登录后执行 **第九节** 中的 `git pull`、前后端构建、`systemctl restart` / `docker compose`、`nginx reload`。

具体 YAML 可按团队规范使用 **`appleboy/ssh-action`**、`rsync` 等，此处不绑定单一模板。

---

## 十一、与 Vercel 的分工

| 场景 | 访问方式 |
|------|----------|
| **正式用户** | **`https://app.你的域名.com`** → ECS 上 Nginx |
| **PR / 内部预览** | **Vercel** **`*.vercel.app`** |
| **避免** | 正式 **`app`** DNS 仍指向 Vercel，导致流量未到 ECS |

---

## 十二、常见问题

| 现象 | 排查 |
|------|------|
| 接口失败 / CORS | **`APP_CORS_ORIGINS`** 是否与浏览器地址完全一致（含 `https`） |
| 白屏或路由 404 | **`root`** 是否指向最新 **`dist`**；`try_files` 是否回落 **`/index.html`** |
| PDF、图片无法打开 | Nginx 是否配置 **`location /uploads/`**；后端存储目录权限 |
| WebSocket 异常 | **`location /ws/`** 是否包含 **`Upgrade`**；后端是否在 **4000**；是否走 HTTPS |

---

更底层的组件安装（Docker / 原生 MySQL·Redis·systemd）仍以 **[deploy-aliyun-ecs.md](./deploy-aliyun-ecs.md)** 与 **[deploy-native-linux.md](./deploy-native-linux.md)** 为准；本文侧重 **正式域名、同源路径与发布节奏**。
