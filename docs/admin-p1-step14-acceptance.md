# 管理员后台 P1 · Step 14 联调验收

本文档用于 **前后端联调与产品验收**：环境就绪后按章节勾选。默认 API 前缀为 `/api`，管理端路由为 `/api/admin/*`，需携带管理员 JWT（与普通用户签发方式一致，`role` 为库内 `admin` 对应的管理员账号）。

---

## 1. 环境与账号

| 序号 | 验收项 | 说明 | 通过 |
| --- | --- | --- | --- |
| 1.1 | 后端可启动 | `APP_PORT`、MySQL、Redis 配置正确；无启动即报错 | ☐ |
| 1.2 | 前端联调后端 | `frontend` 将 `/api` 代理到后端（参考 `frontend/.env.example`）；关闭 Mock 时请求直达真实 API | ☐ |
| 1.3 | 管理员可登录 | 至少一个 `users.role = admin`（接口层称 `ops_admin`）的账号可登录并获得 token | ☐ |
| 1.4 | 测试数据 | 至少：1 名客户（`viewer`）、1 名维修人员（`operator`）、可选 `technician_status` 空闲/占用各一 | ☐ |

---

## 2. 会员等级与「不透出」约定

| 序号 | 验收项 | 说明 | 通过 |
| --- | --- | --- | --- |
| 2.1 | C 端用户 JSON 无 `member_level` | `GET /api/auth/me`、`PATCH /api/users/me` 返回体经 `toPublicUser`，**不包含** `memberLevel` / `member_level` 字段 | ☐ |
| 2.2 | 能力以套餐接口为准 | 前端配额/档位应使用 `GET /api/users/me/plan`（或等价）中的 `level`，与 `types.ts` 注释一致 | ☐ |
| 2.3 | JWT 内含 `memberLevel` | 登录/注册签发 JWT 载荷中仍含 `memberLevel`，供网关与 `requireAuth` 解析；**若明确要求连 JWT 也不暴露给浏览器**，需单独安全方案（非当前实现） | ☐ |
| 2.4 | 仅管理端可见会员字段 | `GET/PATCH /api/admin/users` 等管理接口可返回/修改 `memberLevel`、`memberExpireAt` | ☐ |
| 2.5 | 文档与库枚举一致 | 业务文档中的 **`professional` 在本仓库 DB/API 中为 `pro`**（见 `backend/src/services/dispatchEngine.ts` 注释） | ☐ |

---

## 3. 工单与派单并发（联调重点）

| 序号 | 验收项 | 说明 | 通过 |
| --- | --- | --- | --- |
| 3.1 | 手动建单（待派单） | `POST /api/admin/orders` 仅 `faultId`：生成 `pending` 工单，`assignedTo` 为空 | ☐ |
| 3.2 | 手动建单并指派 | 同一请求带 `assignedTo`：事务内 `SELECT technician_status ... FOR UPDATE`，成功后 `assigned` + 维修工 `is_busy=1` | ☐ |
| 3.3 | 同一维修工二次占用 → 409 | 维修工已 busy 时，再对其 `POST /admin/orders`（带 `assignedTo`）或 `POST /admin/orders/:id/assign` 应返回 **409**，`code` 为冲突类（`ConflictError`） | ☐ |
| 3.4 | 双管理员并发派同一空闲工 | 两台客户端同时派同一维修工：仅一个成功，另一个 **409** 或事务回滚无脏写（MySQL 行锁） | ☐ |
| 3.5 | 自动派单与会员档位 | **free/basic**：不建 `work_orders`，管理员收到 `fault_new`；**pro/enterprise**：事务内 `pickIdleTechnician`（`FOR UPDATE`），有则自动 `assigned` 并占坑，无则 `pending` + `fault_no_tech` | ☐ |
| 3.6 | 终态释放维修工 | 工单进入关闭/驳回（及实现中定义的终态路径）后，`technician_status` 应对应释放（与 `orders` 路由实现一致） | ☐ |

---

## 4. 通知（站内信）

| 序号 | 验收项 | 说明 | 通过 |
| --- | --- | --- | --- |
| 4.1 | 派单触达 | `order_assigned`：维修人员与客户（或管理员）收到与工单相关的标题/摘要 | ☐ |
| 4.2 | 无空闲维修工 | `fault_no_tech`：`ops_admin` 列表用户收到 | ☐ |
| 4.3 | 新故障（低档位） | `fault_new`：低档位仅通知管理员 | ☐ |

---

## 5. 管理端页面（冒烟）

| 序号 | 验收项 | 说明 | 通过 |
| --- | --- | --- | --- |
| 5.1 | 监控 | 总览/客户/库区实时页能拉取数据且无持续报错 | ☐ |
| 5.2 | 工单 | 列表、Tab、派单、驳回、手动建单、抽屉时间与备注符合 Step 12 行为 | ☐ |
| 5.3 | 用户 | 三角色 Tab、搜索/区域/分页、客户绑定冷库、会员与到期编辑（Step 13） | ☐ |
| 5.4 | 区域 | 新建/重名冲突提示正常 | ☐ |

---

## 6. 建议自动化（可选）

- 后端：对 `ConflictError` 与派单事务已有单测时，在 CI 中跑；无则优先为 `orders.assign` 与 `POST /orders`（带 `assignedTo`）补集成测试。
- 前端：`npm run typecheck`；核心管理页用手动或 E2E（Playwright）覆盖登录 + 一单派单流。

---

## 7. 验收结论模板

- **联调日期**：________  
- **环境**：________（如 dev / staging）  
- **阻塞项**（若有）：________  
- **签署**：________  

---

## 参考代码位置（便于开发自检）

| 主题 | 路径 |
| --- | --- |
| 公开用户序列化（不含会员等级字段） | `backend/src/modules/users/users.repository.ts` → `toPublicUser` |
| 登录 JWT 内 `memberLevel` | `backend/src/modules/auth/auth.service.ts` |
| 自动派单与 pro/enterprise | `backend/src/services/dispatchEngine.ts` |
| 手动派单 / 409 | `backend/src/routes/admin/orders.ts` |
| 维修工行锁 | `backend/src/modules/workOrders/workOrders.repository.ts` → `pickIdleTechnician`、`technicianStatusRepo` |
