/**
 * 历史查询范围中间件
 * --------------------------------
 * 按会员等级 historyRangeDays 校验 from/to：
 *   - free:        近 7 天
 *   - basic:       近 30 天
 *   - pro:         近 1 年
 *   - enterprise:  全量
 *
 * 当请求超出范围时：返回 403 + upgradeHint，**不**自动裁剪
 * （静默裁剪会让用户误以为查到了完整数据）。
 */

import type { RequestHandler } from "express";
import { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/utils/errors";
import { getPlan } from "@/config/memberPlans";

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const DAY_MS = 86400 * 1000;

/**
 * 校验后会把 normalized 的 fromAt / toAt 写到 res.locals.historyRange
 * 若用户未传 from/to：默认取 [now - allowedDays, now]
 */
export const enforceHistoryRange: RequestHandler = (req, res, next) => {
  if (!req.user) throw new UnauthorizedError();
  const plan = getPlan(req.user.memberLevel);
  const { from, to } = querySchema.parse(req.query);

  const now = new Date();
  const toAt = to ?? now;
  const allowedDays = plan.historyRangeDays;
  const earliestAllowed =
    allowedDays < 0 ? new Date(0) : new Date(now.getTime() - allowedDays * DAY_MS);

  const fromAt = from ?? (allowedDays < 0 ? new Date(toAt.getTime() - 24 * 3600 * 1000) : earliestAllowed);

  if (fromAt > toAt) {
    throw new ForbiddenError("from 不能晚于 to");
  }
  if (allowedDays >= 0 && fromAt < earliestAllowed) {
    throw new ForbiddenError(
      `当前会员等级仅支持查询最近 ${allowedDays} 天数据，升级会员可解锁更长历史`,
    );
  }

  res.locals.historyRange = { fromAt, toAt };
  next();
};
