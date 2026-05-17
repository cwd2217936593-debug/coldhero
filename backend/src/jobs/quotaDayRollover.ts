/**
 * 配额「日切」定时任务（Step 3）
 * --------------------------------
 * 业务配额天然按 CALENDAR_DAY + Redis TTL（见 quota.service.ts）已做到「新的一天新 KEY」，
 * 本任务在每 UTC+8 日凌晨触发一次钩子，便于：
 *   - 打审计日志（可接监控）
 *   - 后续扩展：离线对账 SCAN、告警等
 */

import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { computeMsUntilNextQuotaRollover, getUtc8DateString } from "@/utils/time";

let timer: NodeJS.Timeout | undefined;
let cancelled = false;

export function startQuotaDayRolloverCron(): () => void {
  if (!env.ENABLE_QUOTA_DAY_ROLLOVER || env.APP_ENV === "test") {
    return () => {
      cancelled = false;
    };
  }

  cancelled = false;

  const schedule = () => {
    if (cancelled) return;
    const ms = computeMsUntilNextQuotaRollover();
    timer = setTimeout(tick, ms);
  };

  async function tick() {
    try {
      const date = getUtc8DateString();
      logger.info(
        { rollover: true, utc8CalendarDate: date, tz: "Asia/Shanghai" },
        "📅 UTC+8 配额日切钩子：新 KEY（quota:user:date:type）已开始生效（旧 KEY 由 TTL 过期）",
      );
    } catch (e) {
      logger.warn({ err: e }, "配额日切钩子异常（已吞噬，将继续调度下一轮）");
    } finally {
      if (!cancelled) schedule();
    }
  };

  schedule();
  logger.info({}, "配额日切定时任务已启动（递归 setTimeout）");

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    timer = undefined;
    logger.info({}, "配额日切定时任务已停止");
  };
}
