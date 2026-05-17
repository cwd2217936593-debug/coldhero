/**
 * P2：会员到期提醒定时任务占位（提示词 Step 9；API 见 routes/admin/members.ts）
 */

import { logger } from "@/utils/logger";
import { env } from "@/config/env";

/**
 * Step 9：占位注册；真正实现后与 `routes/admin/members.ts`（P2 API）共用策略模型。
 */
export function registerMemberExpireCronPlaceholder(): () => void {
  if (env.APP_ENV === "test") return () => {};
  logger.info({}, "P2 Step 9：会员到期扫描任务占位已注册（noop，见 jobs/memberExpire.ts）");
  return () => {
    logger.debug({}, "P2 Step 9：会员到期占位已卸载（noop）");
  };
}
