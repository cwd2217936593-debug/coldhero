/**
 * 每日配额中间件
 * --------------------------------
 * 用法：
 *   router.post('/api/chat', requireAuth, requireQuota('aiChat'), handler);
 *   router.post('/api/reports', requireAuth, requireQuota('report'), handler);
 *
 * 行为：
 *  1. 通过中间件 → 把本次结果挂到 res.locals.quota，供后续业务 / 响应头使用
 *  2. 超额 → 抛 TooManyRequestsError（HTTP 429）
 *  3. 在响应头注入 X-Quota-Limit / X-Quota-Used / X-Quota-Remaining / X-Quota-Reset
 *
 * 注意：
 *  - 该中间件 **会** 真正消费一次配额。业务异常需要回滚时显式调用 quotaService.refund(...)
 *  - 企业版 limit=-1 → Lua 脚本永远 allowed
 */

import type { RequestHandler } from "express";
import { TooManyRequestsError, UnauthorizedError } from "@/utils/errors";
import { getPlan } from "@/config/memberPlans";
import { quotaService } from "@/modules/quota/quota.service";
import type { QuotaType } from "@/modules/quota/quota.types";

const TYPE_LABEL: Record<QuotaType, string> = {
  aiChat: "AI 问答",
  report: "AI 检测报告",
};

export function requireQuota(type: QuotaType): RequestHandler {
  return async (req, res, next) => {
    if (!req.user) throw new UnauthorizedError();

    const plan = getPlan(req.user.memberLevel);
    const result = await quotaService.checkAndConsume(req.user.id, plan, type);

    res.setHeader("X-Quota-Type", type);
    res.setHeader("X-Quota-Limit", String(result.limit));
    res.setHeader("X-Quota-Used", String(result.used));
    res.setHeader("X-Quota-Remaining", String(result.remaining));
    res.setHeader("X-Quota-Reset", result.resetAt.toISOString());

    if (!result.allowed) {
      throw new TooManyRequestsError(
        `当日 ${TYPE_LABEL[type]} 次数已用完（${result.used}/${result.limit}），${formatReset(result.resetAt)} 后重置`,
        {
          quota: result,
          upgradeHint: "升级会员可获得更多配额",
        },
      );
    }

    res.locals.quota = result;
    next();
  };
}

function formatReset(d: Date): string {
  const wall = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return wall.toISOString().replace("T", " ").slice(0, 19) + " (UTC+8)";
}
