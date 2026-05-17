/**
 * 管理员 API 总路由（提示词 Step 3）
 * --------------------------------
 * - 统一：`requireAuth` → `requireAdminAuth`（JWT 后再校平台管理员角色）
 * - P1：`/monitor`、`/orders`、`/users`、`/regions`；站内信另有路由；Step 9 P2：`/surveys`、`/reports`、`/members` 统一 501
 * - 对外前缀：在 `routes/index.ts` 中挂到 `/admin`，经 `app.ts` 的 `/api` 后为 `/api/admin/*`
 */

import { Router } from "express";
import { requireAuth } from "@/middlewares/auth";
import { requireAdminAuth, requireStrictAdminAuth } from "@/middlewares/adminAuth";
import monitorRouter from "./monitor";
import ordersRouter from "./orders";
import usersRouter from "./users";
import notificationsRouter from "./notifications";
import regionsRouter from "./regions";
import surveysRouter from "./surveys";
import reportsAdminRouter from "./reports";
import membersRouter from "./members";

const adminRouter = Router();

adminRouter.use(requireAuth, requireAdminAuth);
adminRouter.use("/users", requireStrictAdminAuth, usersRouter);
adminRouter.use("/regions", requireStrictAdminAuth, regionsRouter);
adminRouter.use("/monitor", monitorRouter);
adminRouter.use("/orders", ordersRouter);
adminRouter.use("/notifications", notificationsRouter);
adminRouter.use("/surveys", surveysRouter);
adminRouter.use("/reports", reportsAdminRouter);
adminRouter.use("/members", membersRouter);

export default adminRouter;
