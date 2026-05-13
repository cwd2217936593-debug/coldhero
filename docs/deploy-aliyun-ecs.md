# 在阿里云 ECS 上部署 ColdHero 全流程

本文说明如何把 **MySQL、Redis、Node 后端、React 前端** 整套系统部署到一台 **阿里云 ECS** 上，与仓库根目录 **`docker-compose.yml`** 行为一致。

**架构简述：** 四个容器在同一 Docker 网络内；浏览器只访问 **前端容器**（默认映射宿主 **`5173 → 容器 80`**），由容器内 Nginx 将 **`/api/`、`/ws/`、`/uploads/`** 反代到后端；数据库与 Redis **不建议对公网开放**。

**若机器无法安装 Docker / Compose：** 请改用 **[deploy-native-linux.md](./deploy-native-linux.md)**（MySQL + Redis + Node + Nginx 原生安装）。

**正式环境使用单一域名（如 `https://app.example.com`）托管前端并由 Nginx 反代 API：** **[deploy-same-origin-production.md](./deploy-same-origin-production.md)**。

---

## 一、准备 ECS

### 1.1 规格与系统建议

| 项目 | 建议 |
|------|------|
| 实例规格 | 至少 **2 vCPU / 4 GiB**；报告生成、并发略多时建议 4 GiB 及以上 |
| 系统盘 | **40 GB+**，镜像与 Docker 镜像、日志会占空间 |
| 操作系统 | **Ubuntu 22.04 LTS**（下文命令以此为准）；Alibaba Cloud Linux 可用 `dnf` 类比安装 Docker |
| 网络 | 分配 **公网 IP**（或后续配合 SLB / NAT 出站） |

### 1.2 安全组（关键）

在 **ECS → 网络与安全组 → 安全组规则** 中配置：

| 方向 | 协议 | 端口 | 授权对象 | 说明 |
|------|------|------|----------|------|
| 入站 | TCP | **22** | 你的办公网 IP / 跳板机 | SSH，勿对 `0.0.0.0/0` 长期全开 |
| 入站 | TCP | **5173** | `0.0.0.0/0` 或访客网段 | 当前 Compose 下 **Web 入口**（前端 Nginx） |
| 入站 | TCP | **80 / 443** | 按需 | 若宿主机再做反向代理或上证书时使用 |

**不要** 对公网放行 **3306（MySQL）**、**6379（Redis）**。  
Compose 文件里虽可能映射这些端口，只要安全组不开放，外网无法直连数据库。

### 1.3 登录服务器

```bash
ssh root@<ECS公网IP>
# 或
ssh ubuntu@<ECS公网IP>   # 部分镜像默认普通用户，再用 sudo
```

---

## 二、安装 Docker 与 Compose（Ubuntu 22.04）

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo systemctl enable --now docker
docker --version
docker compose version
```

非 root 用户加入 `docker` 组（可选，重新登录生效）：

```bash
sudo usermod -aG docker $USER
```

---

## 三、获取项目代码

在 ECS 上选一种方式即可。

**方式 A：Git 克隆（推荐）**

```bash
cd /opt
sudo git clone <你的仓库 HTTPS 或 SSH 地址> coldhero
sudo chown -R $USER:$USER coldhero
cd coldhero
```

**方式 B：本机打包上传**

在本机项目根目录：

```bash
tar czvf coldhero.tar.gz --exclude=node_modules --exclude=.git coldhero
scp coldhero.tar.gz root@<ECS公网IP>:/opt/
```

在 ECS 上：

```bash
cd /opt && tar xzvf coldhero.tar.gz && cd coldhero
```

确保目录中包含：**`docker-compose.yml`**、**`backend/`**、**`frontend/`**、**`database/init/`**、**`.env.example`**。

---

## 四、配置环境变量

```bash
cd /opt/coldhero   # 按你的实际路径
cp .env.example .env
nano .env
```

### 4.1 必须修改的项

| 变量 | 说明 |
|------|------|
| **`JWT_SECRET`** | 至少 **16 位**随机字符串；生产切勿使用示例值 |
| **`AI_API_KEY`** | DeepSeek / 通义等 API Key，否则 AI 问答与报告生成会失败 |

若使用 DeepSeek，可保持 `.env.example` 中的 **`AI_BASE_URL`**、**`AI_PROVIDER`** 等默认即可。

###c与 Docker Compose 配合的 MySQL / Redis

`docker-compose.yml` 会为 **`backend`** 容器注入：

- `MYSQL_HOST=mysql`
- `REDIS_HOST=redis`

因此 **`.env` 里不要** 再把 `MYSQL_HOST` / `REDIS_HOST` 写成 `127.0.0.1`（会覆盖 compose 的注入，导致后端连不上库）。

请在 `.env` 中配置与 **`mysql` 服务**一致的信息（与 compose 中变量占位一致即可）：

- **`MYSQL_DATABASE`**、**`MYSQL_USER`**、**`MYSQL_PASSWORD`**、**`MYSQL_ROOT_PASSWORD`**

容器内 MySQL 用户密码需与上述一致；首次启动时 `database/init` 会在空数据目录下自动执行建表与种子数据。

### 4.3 CORS（用域名或 HTTPS 访问时必配）

当浏览器访问地址不是 `http://localhost:5173` 时，必须把真实前端来源写进：

**`APP_CORS_ORIGINS`**

多个来源用 **英文逗号** 分隔，**不要多余空格**（或与代码解析习惯一致）。示例：

```env
APP_CORS_ORIGINS=http://<ECS公网IP>:5173,https://你的域名
```

生产建议使用 **HTTPS 域名**，并只保留允许的 Origin。

### 4.4 文件存储：本地磁盘 vs 阿里云 OSS

- **不配 OSS**：使用 ECS 磁盘，Compose 已将 **`backend/storage`**（含 **`uploads`**、**`fonts`**、**`forecasts`**）挂载进后端容器；前端容器内 Nginx 已将 **`/uploads/`** 反代到后端，PDF 与上传图片可通过站点同源路径访问。
- **配置 OSS**：在 `.env` 中填写完整的 **`ALI_OSS_REGION`**、**`ALI_OSS_BUCKET`**、**`ALI_OSS_ACCESS_KEY_ID`**、**`ALI_OSS_ACCESS_KEY_SECRET`**，并设置 **`ALI_OSS_ENDPOINT`** 与（建议）**`ALI_OSS_PUBLIC_BASE_URL`**。详见仓库根目录 **`.env.example`** 注释。

### 4.5 应用端口

默认 **`APP_PORT=4000`**。Compose 将宿主 **`${APP_PORT:-4000}`** 映射到容器 4000。  
若同一台机器 **`4000` 已被占用**，在 `.env` 中改为其它端口，并 **`docker compose up` 前** 确认映射无冲突。

---

## 五、首次启动

在项目根目录（含 **`docker-compose.yml`**）执行：

```bash
docker compose up -d --build
```

首次会：**构建后端 / 前端镜像**、拉取 **MySQL 8**、**Redis 7**、初始化数据库脚本（仅数据目录为空时执行 **`database/init/*.sql`**）。

查看状态与日志：

```bash
docker compose ps
docker compose logs -f backend --tail=100
```

**健康检查（在 ECS 本机）：**

```bash
curl -s http://127.0.0.1:4000/api/health
curl -s http://127.0.0.1:4000/api/health/deep
```

`deep` 应体现 MySQL、Redis 已连通。

**浏览器访问：**

```text
http://<ECS公网IP>:5173
```

（与 **`frontend` 服务的 `ports: "5173:80"`** 一致。）

---

## 六、种子用户密码（必做一次）

种子数据里的密码哈希为占位，需在后端容器内执行一次：

```bash
docker exec -it coldhero-backend npm run seed:passwords
```

完成后可用 README 中说明的默认密码（如 **`Coldhero@123`**）登录演示账号；**生产环境请尽快修改密码或禁用演示账号**。

---

## 七、可选：演示数据（传感器与预测 CSV）

若需要仪表盘、预测等演示效果，可在后端容器内执行（详见根目录 **README.md**）：

```bash
docker exec -it coldhero-backend npm run mock:sensors
# 运行一段时间后另开终端：
docker exec -it coldhero-backend npm run gen:forecasts
```

---

## 八、升级与维护

### 8.1 更新代码后重新部署

```bash
cd /opt/coldhero
git pull   # 若使用 Git
docker compose up -d --build
```

### 8.2 查看 / 清理

```bash
docker compose logs -f
docker compose down          # 停止并删除容器（默认保留 volume）
docker volume ls             # 查看 mysql_data、redis_data
```

**注意：** `mysql_data` 卷删除后相当于清空数据库，需重新执行 init SQL 与 **`seed:passwords`**。

### 8.3 PDF 中文字体（报告）

若 PDF 中文乱码或生成失败，在宿主 **`backend/storage/fonts/`** 放入 **`.env.example`** 中推荐的字体文件（如 `NotoSansSC-Regular.otf`），Compose 已挂载该目录，重启后端容器即可。

---

## 九、生产环境加固建议

1. **安全组**：仅开放 **22（限定来源 IP）、5173 或 80/443**；永不向全网开放 **3306、6379**。
2. **强密码**：`MYSQL_*`、`JWT_SECRET`、各类 API Key 使用高强度随机值。
3. **HTTPS**：购买或使用免费证书，在 ECS 前加 **SLB** 或在宿主机用 **Caddy / Nginx** 监听 443，反代到 `127.0.0.1:5173`；同时把 **`APP_CORS_ORIGINS`** 改为 `https://你的域名`。
4. **数据备份**：定期备份 Docker volume **`mysql_data`**，或使用阿里云 **RDS** 替代 compose 内 MySQL（需改 **`MYSQL_HOST`** 等与 RDS 一致，并保证后端容器网络可达）。
5. **SSH**：禁用密码登录、仅用密钥，或配合堡垒机。

---

## 十、常见问题

| 现象 | 排查方向 |
|------|----------|
| 浏览器打不开页面 | 安全组是否放行 **5173**；`docker compose ps` 中 **frontend** 是否 Up |
| 登录后接口 401 / CORS 报错 | **`APP_CORS_ORIGINS`** 是否包含浏览器地址栏的 **协议+主机+端口** |
| `deep` 健康检查失败 | **mysql/redis** 是否 Healthy；`backend` 日志是否报连接拒绝；`.env` 是否误把 **`MYSQL_HOST`** 设为 `127.0.0.1` |
| PDF 无法打开（未用 OSS） | 确认已使用包含 **`/uploads/`** 反代的 **`frontend/nginx.conf`** 构建的前端镜像；或改用 OSS |
| 报告一直处于 queued | **Redis** 不可用时队列无法消费；查看 **`coldhero-backend`** 日志与 **`QUEUE_CONCURRENCY`** |

---

## 十一、组件与端口对照（默认 Compose）

| 服务 | 容器名（默认） | 宿主端口（默认） | 说明 |
|------|----------------|------------------|------|
| 前端 | coldhero-frontend | **5173 → 80** | 对外访问入口 |
| 后端 | coldhero-backend | **4000 → 4000** | 可不对外开放，仅调试用 |
| MySQL | coldhero-mysql | 3306 | 建议安全组关闭公网访问 |
| Redis | coldhero-redis | 6379 | 建议安全组关闭公网访问 |

---

更简短的本地体验步骤仍以仓库根目录 **README.md** 为准；本文侧重 **阿里云 ECS 单机上線流程与安全要点**。
