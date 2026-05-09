# 冷库智能监管平台 (ColdHero)

面向冷链 / 冷库运营商及终端顾客的 SaaS 监管平台。核心能力：AI 问答、实时温度监测、故障报告、历史数据分析与 AI 检测报告生成。

> 当前进度：**已完成阶段 1～9 + 完整可用的 React 前端**。可一键 docker compose up 体验。

---

## 技术栈

| 层级 | 选型 |
|------|------|
| 前端 | React 18 + TypeScript + Tailwind CSS + ECharts（后续模块） |
| 后端 | Node.js 20 + Express + TypeScript |
| 数据库 | MySQL 8 + Redis 7 |
| AI | DeepSeek / 阿里云通义千问（OpenAI 兼容协议） |
| 队列 | BullMQ（Redis 驱动） |
| 文件 | PDF: puppeteer / Word: docx（后续模块） |
| 部署 | Docker Compose |

---

## 目录结构

```
coldhero/
├── docker-compose.yml          # 一键启动 MySQL + Redis + 后端
├── .env.example                # 环境变量示例（含所有密钥占位）
├── database/
│   └── init/
│       ├── 01_schema.sql       # 数据库建表（10 张核心表）
│       └── 02_seed.sql         # 种子数据（用户/库区/示例问卷）
└── backend/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── server.ts           # 进程入口
        ├── app.ts              # Express 工厂
        ├── config/
        │   ├── env.ts          # 环境变量校验（zod）
        │   └── memberPlans.ts  # 4 档会员等级配置
        ├── db/
        │   ├── mysql.ts        # mysql2 连接池
        │   └── redis.ts        # ioredis 客户端 + 队列连接
        ├── middlewares/
        │   └── errorHandler.ts # 统一错误处理 + 404 兜底
        ├── routes/
        │   ├── index.ts        # 路由总入口
        │   └── health.ts       # 健康检查
        ├── scripts/
        │   └── seedPasswords.ts # 种子用户密码重置脚本
        └── utils/
            ├── errors.ts       # AppError + 子类
            └── logger.ts       # pino 日志
```

---

## 三分钟快速体验

### 1. 准备环境变量

```bash
cp .env.example .env
# 至少填入：JWT_SECRET（任意 16+ 位强随机串）、AI_API_KEY（你的 DeepSeek/通义千问 Key）
```

> ⚠️ 你提到的 API Key 看起来是 DeepSeek 的（`sk-` 开头）。`.env.example` 默认就是 DeepSeek，无需改 BaseURL。如果切换到阿里云通义千问，把以下两项改一下即可：
> ```env
> AI_PROVIDER=qwen
> AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
> AI_MODEL_FAST=qwen-plus
> AI_MODEL_PRO=qwen-max
> ```

### 2. 一键启动（推荐）

```bash
docker compose up -d --build
```

启动后会自动：
- 拉起 MySQL 8（端口 3306）
- 拉起 Redis 7（端口 6379）
- 自动执行 `database/init/*.sql` 建表 + 写入种子数据
- 构建并启动后端（端口 4000）
- 构建并启动前端（端口 **5173**，nginx 反代 `/api` 与 `/ws`）

健康检查：

```bash
curl http://localhost:4000/api/health         # 基本存活
curl http://localhost:4000/api/health/deep    # 深度检查（MySQL/Redis）
```

### 3. 重置种子用户密码（首次启动后执行一次）

种子数据中的密码哈希是占位串，必须用以下脚本生成真实哈希：

```bash
# 进入后端容器执行
docker exec -it coldhero-backend npm run seed:passwords
# 或本地执行（需先 npm install）
cd backend && npm run seed:passwords
```

执行后所有种子用户（admin / demo_free / demo_basic / demo_pro / demo_ent）密码统一为：**`Coldhero@123`**。

### 4. 启动模拟数据 + 生成预测 CSV（演示完整闭环必做）

```bash
# 持续推送传感器数据（前端会实时刷新）— 在另一个终端跑
docker exec -it coldhero-backend npm run mock:sensors

# 等数据攒满几分钟后，生成示例预测 CSV
docker exec -it coldhero-backend npm run gen:forecasts
```

### 5. 打开前端

浏览器访问 **http://localhost:5173** ，使用登录页提供的"一键登录卡片"快速切换会员等级体验。

### 6. 本地开发模式（不走 Docker）

```bash
# 终端 A：后端
cd backend && npm install && npm run dev

# 终端 B：前端（vite 开发模式，已自动反代到 localhost:4000）
cd frontend && npm install && npm run dev

# 终端 C：模拟数据
cd backend && npm run mock:sensors
```

### 7. 纯前端 Mock 模式（最快预览，零依赖）

如果你完全没有 Docker / MySQL / Redis 环境，只想看 UI：

```bash
cd frontend
echo "VITE_USE_MOCK=1" > .env.local      # 启用前端 mock
npm install && npm run dev
# → http://localhost:5173
```

Mock 层会拦截 axios / fetch (SSE) / WebSocket，全部走内存模拟数据：
仪表盘卡片每 4 秒滚一次，AI 对话有打字机效果，故障报告 2.5 秒后回填 AI 初步分析。
切换到真实后端只需删掉 `.env.local` 即可。

---

## 数据库表速览

| 表 | 说明 |
|----|------|
| `users` | 用户 + 4 档会员等级（free / basic / pro / enterprise） |
| `user_quotas` | 每日配额持久化（Redis 是热数据兜底） |
| `zones` | 多库区配置（含温/湿/CO₂ 阈值） |
| `ai_chat_logs` | AI 问答全量日志（FAQ 归因来源） |
| `faq_topics` | 高频问题归因表（每日 00:30 定时聚合） |
| `sensor_history` | 传感器时序数据 |
| `fault_reports` | 用户提交故障报告 |
| `generated_reports` | AI 检测报告生成记录（PDF/Word URL） |
| `surveys` / `survey_responses` | 自定义问卷与答卷 |
| `notifications` | 站内消息通知 |

完整 DDL 见 `database/init/01_schema.sql`。

---

## 会员等级配额

| 等级 | AI 问答/日 | 报告/日 | 历史范围 | Word 导出 | 优先生成 | API 接入 |
|------|-----------|---------|---------|-----------|---------|---------|
| free | 5 | 1 | 7 天 | ✗ | ✗ | ✗ |
| basic | 30 | 5 | 30 天 | ✓ | ✗ | ✗ |
| pro | 100 | 20 | 1 年 | ✓ | ✓ | ✗ |
| enterprise | 不限 | 不限 | 全量 | ✓ | ✓ | ✓ |

> 配置代码：`backend/src/config/memberPlans.ts`

---

## 限流机制（阶段 3）

平台有两个**独立**维度的限流：

### 1. 每日配额（quota） — 跟用户与会员等级绑定

| 维度 | 实现 |
|------|------|
| 存储 | Redis Key `quota:{userId}:{YYYY-MM-DD}:{type}` |
| 切日 | 按 **UTC+8** 0:00 自动重置（Redis EXPIRE 至下一个 00:00） |
| 持久化 | `user_quotas` 表 write-behind 异步 UPSERT，断电不丢账 |
| 原子性 | EVAL Lua 脚本一次性 GET → 比较 → INCR → EXPIRE |
| 中间件 | `requireQuota('aiChat' \| 'report')` |
| 超额 | HTTP 429，响应 details 含 `quota` 与 `upgradeHint`，前端弹升级引导 |
| 响应头 | `X-Quota-Limit / X-Quota-Used / X-Quota-Remaining / X-Quota-Reset` |

> 用法示例（后续 chat / report 路由会接入）：
> ```ts
> chatRouter.post('/', requireAuth, requireQuota('aiChat'), handler);
> ```

### 2. 接口频率限流（rate-limit） — 防刷

固定窗口 INCR + EXPIRE，已在 `/api/auth/login`（每 IP 60s/10 次）、`/api/auth/register`（每 IP 60s/5 次）启用。后续可按需挂任意路由：

```ts
const aiLimiter = rateLimit({ name: 'ai:chat', window: 60, max: 30, keyBy: 'user' });
chatRouter.post('/', requireAuth, aiLimiter, requireQuota('aiChat'), handler);
```

### 验证示例

```bash
# 查询当前配额
TOKEN=...
curl http://localhost:4000/api/users/me/quota -H "Authorization: Bearer $TOKEN"

# 触发频率限流（连续 11 次登录失败）
for i in {1..11}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"identifier":"x","password":"x"}'
done
# 第 11 次返回 429
```

---

## 实时数据通道（阶段 4）

### 架构

```
[IoT / mock 脚本] --HTTP POST--> /api/sensors/ingest
                                       |
                                       | 写 sensor_history
                                       | 阈值判断（zones 表）
                                       v
                                Redis Pub/Sub
                          ┌────────┴────────┐
              sensor:update            sensor:alert
                  │                          │
                  v                          v
           WebSocket 网关 ── 按 zoneId 过滤 ──> 浏览器客户端
                                       │
                                       └──> 写 notifications 表（去抖 3 分钟）
```

### WebSocket 协议

地址：`ws://<host>/ws/sensors?token=<JWT>`

**Client → Server**
```json
{"type":"subscribe","zoneIds":[1,2]}   // [] 或省略 = 接收全部
{"type":"ping"}
```

**Server → Client**
```json
{"type":"welcome","userId":1,"zones":"all"}
{"type":"subscribed","zoneIds":[1,2]}
{"type":"sensor","zoneId":1,"zoneCode":"A01","data":{...}}
{"type":"alert","zoneId":1,"zoneCode":"A01","zoneName":"A 区 - 速冻库","level":"critical","reasons":["温度过高: 5℃ > 上限 -18℃"],"data":{...}}
{"type":"pong"}
```

服务端每 30s 主动 `ping`，60s 内未收到 `pong` 视为僵尸连接，强制断开。

### 启动模拟数据

```bash
# 1. 后端必须已启动
docker compose up -d
docker exec -it coldhero-backend npm run seed:passwords  # 首次必做

# 2. 启动模拟数据生成器（默认每 5s 推送，~5% 概率制造异常告警）
docker exec -it coldhero-backend npm run mock:sensors
# 或本地：cd backend && npm run mock:sensors
```

可调参数（环境变量）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MOCK_API_BASE` | `http://localhost:4000` | 后端基址 |
| `MOCK_USER` | `admin` | 用于推送的账号 |
| `MOCK_PASSWORD` | `Coldhero@123` | 密码 |
| `MOCK_INTERVAL_MS` | `5000` | 推送间隔 |
| `MOCK_ANOMALY_RATE` | `0.05` | 异常点比例（0~1） |

### 验证

```bash
# 1. HTTP 拉取当前快照
curl http://localhost:4000/api/sensors/zones -H "Authorization: Bearer $TOKEN" | jq

# 2. 拉取最近 2 小时温度曲线
curl "http://localhost:4000/api/sensors/zones/1/series?window=2h" \
  -H "Authorization: Bearer $TOKEN" | jq

# 3. WebSocket 实时（需 wscat 等工具）
# npm i -g wscat
wscat -c "ws://localhost:4000/ws/sensors?token=$TOKEN"
> {"type":"subscribe","zoneIds":[1]}
< {"type":"sensor","zoneId":1,"data":{...}}
```

---

## 前端

打开 **http://localhost:5173** 体验：

| 页面 | 路径 | 说明 |
|------|------|------|
| 登录 | `/login` | 内置 5 个一键登录卡片，密码 `Coldhero@123` |
| 实时仪表盘 | `/dashboard` | 全库区卡片 + WebSocket 实时刷新 + 选中库区 2h 曲线 + 异常浮层告警 |
| 橱窗 | `/showcase` | 大屏视角公开视图（仅 is_public=1 库区） |
| 历史与拟合 | `/history` | 范围/库区切换，实际曲线（实线）+ 预测曲线（紫色虚线），RMSE/MAE/MAPE 指标卡片 |
| AI 问答 | `/chat` | SSE 流式打字机，会话列表，模型 fast/pro 切换 |
| 通知中心 | `/notifications` | 全部 / 仅未读，单条/批量已读 |
| 问卷调查 | `/surveys` | 参与已发布问卷；admin/operator 可管理与查看统计 |

技术栈：React 18 + TypeScript + Vite + Tailwind CSS + ECharts + Zustand + React Router v6。

顶部条会显示当前 AI 问答 / 报告生成的今日剩余配额，超过 80% 自动变红提示。生产部署使用 nginx 反代 `/api`（含 SSE 长连接）与 `/ws`（WebSocket Upgrade）到后端。

---

## AI 问答（阶段 5）

### 后端流程

```
[用户提问] -> requireAuth -> rateLimit(user/60s/30) -> requireQuota('aiChat')
                                            |
                                            v
       insert ai_chat_logs(status=pending) ──┘
                                            |
                                            v
       拼 system + 最近 10 轮历史 + 用户问题 ──> aiClient(deepseek/qwen)
                                            |
                                            v
                                       SSE 逐 token 推送
                                            |
                                            v
                                  ai_chat_logs.status=success
                                  失败 → markFailed + quotaService.refund
```

系统提示词内置冷库行业知识基线 + 当前用户库区配置（阈值），让回答能直接引用 `A 区的温度上限是 -18 ℃`。代码：`backend/src/services/coldStoragePrompt.ts`。

### 同步调用示例

```bash
curl -s -X POST http://localhost:4000/api/chat/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"A 区温度比上限高了 2 度，怎么处理？"}' | jq
```

### SSE 流式（前端推荐）

**响应事件序列**

```
data: {"type":"start","sessionId":"...","logId":1,"tier":"fast"}

data: {"type":"delta","delta":"首先"}

data: {"type":"delta","delta":"检查"}

...

data: {"type":"end","done":true,"sessionId":"...","logId":1,"latencyMs":4200,"model":"deepseek-chat"}

data: [DONE]
```

**前端最简消费代码（fetch + ReadableStream）**

```ts
async function askStream(token: string, question: string, onDelta: (s: string) => void) {
  const res = await fetch('/api/chat/messages/stream', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question }),
  });
  if (!res.body) throw new Error('no body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      const line = evt.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      const obj = JSON.parse(data);
      if (obj.type === 'delta') onDelta(obj.delta);
    }
  }
}
```

> 推荐前端用 `@microsoft/fetch-event-source` 或 Vercel `ai` 包，原生 EventSource 不支持 POST。

### 配额行为

| 触发情形 | 配额扣减 | 是否退还 |
|---------|---------|---------|
| 中间件拒绝（超额） | 不扣 | — |
| AI 调用全程失败 | 已扣 | ✓ 自动退还 |
| SSE 已开始推 token，连接中断 | 已扣 | ✗ 不退还（用户已收到部分价值） |
| AI 调用成功 | 已扣 | ✗ |

> 双重限流：per-user 60s/30 次（防误触发） + 每日 `aiChat` 配额（按会员等级）。AI 调用失败时配额会自动退还。  
> 模型选择：`model: 'fast' | 'pro'`（pro 仅 pro/enterprise 可用，其它套餐自动降级到 fast）。

---

## 当前已实现的接口

### 健康检查
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 服务存活检查 |
| GET | `/api/health/deep` | MySQL + Redis 深度检查 |

### 认证（阶段 2）
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | 公开 | 注册（默认 free 等级 / viewer 角色） |
| POST | `/api/auth/login` | 公开 | 用户名或邮箱登录，返回 JWT |
| POST | `/api/auth/logout` | 必须 | 仅记录日志（JWT 由前端丢弃） |
| GET  | `/api/auth/me` | 必须 | 当前用户信息 |
| POST | `/api/auth/change-password` | 必须 | 修改密码 |

### 用户与会员
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET   | `/api/users/me/plan` | 必须 | 当前会员套餐与配额上限 |
| GET   | `/api/users/me/quota` | 必须 | 查询今日 AI 问答 / 报告配额使用与剩余 |
| PATCH | `/api/users/me` | 必须 | 修改昵称 / 手机号 / 头像 |
| POST  | `/api/users/:id/upgrade` | admin | 切换会员等级（后续付费回调会替换） |

### 库区（阶段 4）
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET    | `/api/zones/public`     | 公开 | 橱窗页公开库区（is_public=1） |
| GET    | `/api/zones`            | 必须 | 全部库区 |
| GET    | `/api/zones/:id`        | 必须 | 库区详情（含阈值） |
| POST   | `/api/zones`            | admin | 创建 |
| PATCH  | `/api/zones/:id`        | admin | 更新 |
| DELETE | `/api/zones/:id`        | admin | 删除 |

### 实时温度（阶段 4）
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/sensors/ingest`             | admin/operator | 单点写入（IoT 设备 / 模拟脚本） |
| POST | `/api/sensors/ingest/batch`       | admin/operator | 批量写入（最多 200 条） |
| GET  | `/api/sensors/zones`              | 必须 | 全部库区"当前快照" → 概览卡片 |
| GET  | `/api/sensors/zones/:id/series`   | 必须 | 指定库区时序曲线（默认近 2h） |

### 站内通知（阶段 4）
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET  | `/api/notifications`               | 必须 | 当前用户消息列表（含广播） |
| GET  | `/api/notifications/unread-count`  | 必须 | 未读总数 |
| POST | `/api/notifications/mark-read`     | 必须 | `{ ids:number[] }` 批量已读 |
| POST | `/api/notifications/mark-all-read` | 必须 | 全部已读 |

### AI 问答（阶段 5）
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/chat/messages`         | 必须 + 配额 | 同步问答（一次性返回） |
| POST | `/api/chat/messages/stream`  | 必须 + 配额 | **SSE 流式问答**（推荐，打字机效果） |
| GET  | `/api/chat/sessions`         | 必须 | 我的会话列表 |
| GET  | `/api/chat/sessions/:id/messages` | 必须 | 指定会话历史 |

### 历史与模型拟合（阶段 6）
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/sensors/zones/:id/history`  | 必须 + 范围 | 历史曲线（自动 5min/1h/1d 桶） |
| GET | `/api/sensors/zones/:id/forecast` | 必须 + 范围 | 模型预测曲线（CSV 兑底） |
| GET | `/api/sensors/zones/:id/compare`  | 必须 + 范围 | 实际+预测对比 + RMSE/MAE/MAPE |

> "范围"由 `enforceHistoryRange` 中间件按会员等级裁剪：free 7d / basic 30d / pro 1y / enterprise 全量；超出返 403 + upgradeHint。

### 故障报告（阶段 7）
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST   | `/api/fault-reports/uploads`           | 必须 | 多文件上传（multipart，单图 ≤ 10MB，最多 8 张） |
| POST   | `/api/fault-reports/uploads/presign`   | 必须 | OSS 预签名直传 URL（仅 OSS 模式可用，本地后备返回 null） |
| POST   | `/api/fault-reports`                   | 必须 | 提交故障报告，自动异步触发 AI 初步分析 |
| GET    | `/api/fault-reports?status&severity&zoneId&keyword&mine&page&pageSize` | 必须 | 分页列表（普通用户只看本人；admin/operator 可看全部，加 `mine=true` 切换"仅看我") |
| GET    | `/api/fault-reports/:id`               | 必须 | 详情（提交人或 admin/operator 可见） |
| PATCH  | `/api/fault-reports/:id`               | admin/operator | 状态/严重度/处理意见更新 |
| POST   | `/api/fault-reports/:id/reanalyze`     | 必须 | 重新触发 AI 分析（覆盖 `ai_analysis`） |
| DELETE | `/api/fault-reports/:id`               | 提交人或 admin | 删除 |

**存储后端自动选择**：
- `.env` 中配置完整的 `ALI_OSS_REGION/BUCKET/ACCESS_KEY_ID/SECRET` → 使用阿里云 OSS（图片直接走 CDN/Public 地址）
- 否则回退到本地磁盘（容器内 `/app/storage/uploads`），通过 `/uploads/*` 静态路由访问

**AI 初步分析**：service 层在写库后异步调用 DeepSeek/通义千问，自动注入：
- 库区配置（阈值、备注）
- 最近 30 分钟传感器数据摘要（点数、异常数、温度极值、末点状态）
- 用户上报描述与图片 URL 列表

模型按系统提示词输出 Markdown + 结构化 JSON：`severity / urgency / suspectedCauses / immediateActions / recommendedSpecialty`。
若模型推断的严重度比用户自评更高，service 会自动覆盖；同时给提交人发一条站内通知。

### AI 检测报告（阶段 8）
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST   | `/api/reports`        | 必须 + report 配额 | 提交生成请求（异步入队 BullMQ）；body：`reportType / from / to / zoneIds / formats[]` |
| GET    | `/api/reports?status&reportType&page&pageSize` | 必须 | 报告列表（普通用户仅本人；admin 可全部） |
| GET    | `/api/reports/:id`    | 必须 | 详情（含 contentJson + 文件下载 URL） |
| DELETE | `/api/reports/:id`    | 提交人 / admin | 删除 |

**关键设计**：
- **任务队列**（BullMQ）：worker 常驻进程，`QUEUE_CONCURRENCY` 控制并发；`pro / enterprise` 优先级更高
- **生成流水线**：拉取范围内 sensor_history → 计算每库区统计（极值/均值/异常率/超限分钟）→ 同期故障关联 → AI 生成 markdown 摘要 + 建议 → 渲染 PDF（pdfmake）/ Word（docx）→ 写入 OSS / 本地
- **配额**：`requireQuota('report')` 中间件原子消费；docx 仅 `basic+` 可生成（其它套餐 403 + 自动退还配额）
- **失败重试**：3 次（指数退避 5s/25s）；最终失败 → 状态 `failed` + 异常 message 入库 + 通知提交人
- **PDF 中文字体**：将 `NotoSansSC-Regular.otf` 或 `SourceHanSansCN-Regular.otf` 放置到 `backend/storage/fonts/`，或通过 `REPORT_FONT_PATH` 显式指定；容器内推荐挂卷 `./backend/storage/fonts:/app/storage/fonts`

### 问卷调查（阶段 9）
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/surveys/published` | 无 | 已发布问卷列表（含回收数） |
| GET | `/api/surveys/admin?status&page&pageSize` | admin/operator | 管理端列表 |
| POST | `/api/surveys` | admin/operator | 创建问卷（题目 JSON：`text` / `single` / `multiple`） |
| GET | `/api/surveys/:id` | 可选登录 | 详情（已发布任意读者；草稿仅管理员或创建人） |
| PATCH | `/api/surveys/:id` | admin/operator | 更新标题/说明/题目/状态 |
| DELETE | `/api/surveys/:id` | admin/operator | 删除问卷及全部答卷 |
| POST | `/api/surveys/:id/responses` | 可选登录 | 提交答卷；登录用户同一问卷仅 1 次；接口层有 Redis 频率限制 |
| GET | `/api/surveys/:id/responses?page&pageSize` | admin/operator | 答卷分页列表 |
| GET | `/api/surveys/:id/summary` | admin/operator | 选择题选项频次汇总 |

前端路由 **`/surveys`**：`VITE_USE_MOCK=1` 时 mock 已内置示例问卷与答卷。

### 请求示例

```bash
# 注册
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"a@x.com","password":"Hello1234"}'

# 登录
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin","password":"Coldhero@123"}'

# 用 token 访问
curl http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer <TOKEN>"
```

> 核心业务接口（chat / sensors / faults / reports / surveys）均已可用；FAQ 归因等见阶段 10 规划。

---

## 安全与运维

- **不要把真实 `.env` 提交到 Git**（已在 `.gitignore`）
- 生产环境务必：
  - 设置强随机 `JWT_SECRET`（>= 32 位）
  - Redis 加密码（`REDIS_PASSWORD`）
  - MySQL 仅允许内网访问
  - 阿里云 OSS 使用 STS 临时凭证而非 AK/SK 直存
- 日志使用 pino JSON 格式，便于阿里云 SLS / ELK 采集

---

## 后续模块路线（按文档建议顺序）

- [x] 阶段 1 数据库建表 + 后端项目初始化
- [x] 阶段 2 用户认证（JWT） + 会员等级中间件
- [x] 阶段 3 Redis 限流模块（每日配额 + 接口频率）
- [x] 阶段 4 实时温度展示（WebSocket + 模拟数据生成器）
- [x] 阶段 5 AI 问答（DeepSeek / 通义千问 + 日志入库 + SSE 流式）
- [x] 阶段 6 历史记录 + 模型拟合（CSV 兑底 / Python 微服务可选 / RMSE+MAE+MAPE）
- [x] **前端 v1**：登录、仪表盘、橱窗、历史拟合、AI 对话、通知中心、故障报告、AI 检测报告、问卷调查
- [x] 阶段 7 故障报告（OSS 图片上传 + 多文件 multipart + 异步 AI 初步分析 + 状态流转）
- [x] **阶段 8** AI 检测报告（pdfmake PDF + docx Word + BullMQ 任务队列 + AI 摘要 + 优先级队列）
- [x] **阶段 9** 问卷调查（CRUD + 答卷 + 统计；前端 `/surveys` + mock）
- [ ] 阶段 10 FAQ 归因定时任务 + 阿里云 RDS 同步

---

## 阿里云 RDS 同步方案（faq_topics）

详细配置将在 **阶段 10** 提供，预备方案：

1. **阿里云 DTS（推荐）**：本地 MySQL → RDS 增量订阅，对 `faq_topics` 表做白名单
2. **定时 SQL 导出**：cron 每日 01:00 跑 `mysqldump --tables faq_topics`，再用 `mysql --host=$ALI_RDS_HOST` 灌入
3. **应用层双写**：FAQ 归因任务跑完后直接写一份到 `ALI_RDS_*` 配置的远程库
