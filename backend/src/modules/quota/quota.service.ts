/**
 * 配额服务（Redis 主存储 + MySQL 兜底）
 * --------------------------------
 * Key 规范：quota:{userId}:{YYYY-MM-DD}:{type}（与产品文档一致）
 * 一切"日"按 UTC+8 切分；跨日「重置」不靠人工删 Redis，而是由 **自然日换新 KEY +
 * KEYS 附带 TTL→次日零点自动过期**。`quotaDayRollover` 任务在每 UTC+8 刚过零点打钩子（日志/扩展点）。
 *
 * 核心方法：
 *   - peek(userId, plan, type)              不消费，仅查询当前余额
 *   - checkAndConsume(userId, plan, type)   原子地"未超额则 +1"，否则返回 allowed=false
 *
 * 原子性：通过 EVAL Lua 脚本一次性完成 GET → 比较 → INCR → EXPIRE，
 *         避免高并发下出现"两个请求都看到 limit-1，都通过"的越权。
 */

import { redis } from "@/db/redis";
import { logger } from "@/utils/logger";
import {
  getUtc8DateString,
  nextUtc8Midnight,
  secondsToNextUtc8Midnight,
} from "@/utils/time";
import type { MemberPlan } from "@/config/memberPlans";
import {
  getLimit,
  type QuotaCheckResult,
  type QuotaType,
} from "@/modules/quota/quota.types";
import { quotaRepo } from "@/modules/quota/quota.repository";

function buildKey(userId: number, date: string, type: QuotaType): string {
  return `quota:${userId}:${date}:${type}`;
}

/**
 * Redis MISS 时用 MySQL 当日行回填（机房丢缓存 / flush 后继续接近真实使用量）。
 */
async function hydrateFromMysqlIfMissing(
  userId: number,
  date: string,
  type: QuotaType,
  ttlSeconds: number,
): Promise<void> {
  const key = buildKey(userId, date, type);
  const raw = await redis.get(key);
  if (raw !== null) return;
  const row = await quotaRepo.getByUserDate(userId, date);
  if (!row) return;
  const usedRaw = type === "aiChat" ? row.ai_chat_used : row.report_used;
  const used = Number(usedRaw);
  if (!Number.isFinite(used) || used <= 0) return;
  await redis.set(key, String(used), "EX", ttlSeconds);
}

/**
 * Lua 脚本：原子 check-and-incr
 *
 * KEYS[1]   计数键
 * ARGV[1]   limit（-1 表示不限）
 * ARGV[2]   ttl（秒）
 *
 * 返回 [allowed(0/1), used(int)]
 */
const CHECK_AND_INCR_LUA = `
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if limit >= 0 and current >= limit then
  return {0, current}
end
local newval = redis.call('INCR', KEYS[1])
if newval == 1 then
  redis.call('EXPIRE', KEYS[1], ttl)
end
return {1, newval}
`;

export const quotaService = {
  /** 仅查询当前余额，不做消费 */
  async peek(userId: number, plan: MemberPlan, type: QuotaType): Promise<QuotaCheckResult> {
    const now = new Date();
    const date = getUtc8DateString(now);
    const limit = getLimit(plan, type);
    const ttl = secondsToNextUtc8Midnight(now);
    await hydrateFromMysqlIfMissing(userId, date, type, ttl);
    const key = buildKey(userId, date, type);
    const raw = await redis.get(key);
    const used = raw ? parseInt(raw, 10) : 0;
    return buildResult({ used, limit, type });
  },

  /** 原子检查并消费一次配额；超额返回 allowed=false */
  async checkAndConsume(
    userId: number,
    plan: MemberPlan,
    type: QuotaType,
  ): Promise<QuotaCheckResult> {
    const now = new Date();
    const date = getUtc8DateString(now);
    const limit = getLimit(plan, type);
    const ttl = secondsToNextUtc8Midnight(now);
    await hydrateFromMysqlIfMissing(userId, date, type, ttl);
    const key = buildKey(userId, date, type);

    const reply = (await redis.eval(
      CHECK_AND_INCR_LUA,
      1,
      key,
      String(limit),
      String(ttl),
    )) as [number, number];

    const [allowedFlag, used] = reply;
    const allowed = allowedFlag === 1;

    // write-behind：异步写 user_quotas，不阻塞主请求
    if (allowed) {
      quotaRepo
        .upsertUsed(userId, date, type, used)
        .catch((err) => logger.warn({ err, userId, type }, "user_quotas 持久化失败（不影响主流程）"));
    }

    return buildResult({ used, limit, type });
  },

  /**
   * 回滚一次消费（业务侧失败时调用）
   * 例：AI 调用失败 → 退还配额。永远不会让 used 小于 0。
   */
  async refund(userId: number, type: QuotaType): Promise<void> {
    const date = getUtc8DateString();
    const key = buildKey(userId, date, type);
    const newVal = await redis.decr(key);
    if (newVal < 0) await redis.set(key, "0");
    logger.debug({ userId, type, used: Math.max(0, newVal) }, "配额已退还");
    quotaRepo
      .upsertUsed(userId, date, type, Math.max(0, newVal))
      .catch((err) => logger.warn({ err }, "退还配额持久化失败"));
  },
};

function buildResult(args: { used: number; limit: number; type: QuotaType }): QuotaCheckResult {
  const { used, limit, type } = args;
  const unlimited = limit < 0;
  const remaining = unlimited ? -1 : Math.max(0, limit - used);
  const allowed = unlimited || used < limit;
  return {
    allowed,
    used,
    limit,
    remaining,
    resetAt: nextUtc8Midnight(),
    type,
  };
}
