/**
 * P2 数据报表中心 — 占位路由（提示词 Step 9）
 * --------------------------------
 * TODO P2: 管理端报表聚合 / 导出 / 大屏等
 *
 * 当前任意方法、任意子路径均返回 501。
 */

import { Router } from "express";
import { p2PlaceholderHandler } from "./p2Placeholder";

const router = Router();
router.use(p2PlaceholderHandler("admin.reports"));

export default router;
