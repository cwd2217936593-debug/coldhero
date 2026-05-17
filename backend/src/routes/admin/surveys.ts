/**
 * P2 问卷管理 — 占位路由（提示词 Step 9）
 * --------------------------------
 * TODO P2: 问卷管理接口
 * 计划：GET /list, POST /create, PATCH /:id, GET /:id/stats, GET /:id/export
 *
 * 当前任意方法、任意子路径均返回 501。
 */

import { Router } from "express";
import { p2PlaceholderHandler } from "./p2Placeholder";

const router = Router();
router.use(p2PlaceholderHandler("admin.surveys"));

export default router;
