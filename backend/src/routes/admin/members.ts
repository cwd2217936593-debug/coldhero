/**
 * P2 会员到期提醒 — 占位路由（提示词 Step 9）
 * --------------------------------
 * TODO P2: 提醒策略配置、手动触发、与 jobs/memberExpire.ts 联动
 *
 * 当前任意方法、任意子路径均返回 501。
 */

import { Router } from "express";
import { p2PlaceholderHandler } from "./p2Placeholder";

const router = Router();
router.use(p2PlaceholderHandler("admin.members"));

export default router;
