/**
 * 通用接口频率限流（固定窗口）
 * --------------------------------
 * 用途：防刷登录 / 注册 / AI 接口；与每日"配额"是不同维度。
 *
 * 用法：
 *   const loginLimiter = rateLimit({ window: 60, max: 10, keyBy: 'ip', name: 'login' });
 *   router.post('/login', loginLimiter, handler);
 *
 * 算法：固定窗口 INCR + EXPIRE（首次请求时设置 TTL）
 *      简单、低开销；如需更严格的滑动窗口可后续替换为 Redis ZSET 方案。
 */

import type { Request, RequestHandler } from "express";
import { redis } from "@/db/redis";
import { TooManyRequestsError } from "@/utils/errors";

export interface RateLimitOptions {
  /** 窗口（秒） */
  window: number;
  /** 窗口内最大请求数 */
  max: number;
  /**
   * 计数维度：
   *  - 'ip'   按客户端 IP（默认）
   *  - 'user' 按登录用户 ID（要求已通过 requireAuth 中间件）
   *  - (req) => string 自定义
   */
  keyBy?: "ip" | "user" | ((req: Request) => string);
  /** 用于组装 Redis Key 的命名空间，避免不同接口互相干扰 */
  name: string;
  /** 自定义错误信息 */
  message?: string;
}

const FIXED_WINDOW_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

function resolveIdentifier(req: Request, keyBy: RateLimitOptions["keyBy"]): string {
  if (typeof keyBy === "function") return keyBy(req);
  if (keyBy === "user") return `u:${req.user?.id ?? "anon"}`;
  return `ip:${req.ip ?? "unknown"}`;
}

export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const { window, max, name, keyBy = "ip", message } = opts;

  return async (req, res, next) => {
    const id = resolveIdentifier(req, keyBy);
    const key = `rl:${name}:${id}`;

    const reply = (await redis.eval(FIXED_WINDOW_LUA, 1, key, String(window))) as [number, number];
    const [current, ttl] = reply;

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - current)));
    res.setHeader("X-RateLimit-Reset", String(ttl > 0 ? ttl : window));

    if (current > max) {
      throw new TooManyRequestsError(
        message ?? `请求过于频繁，请 ${ttl > 0 ? ttl : window} 秒后再试`,
        { retryAfterSec: ttl > 0 ? ttl : window },
      );
    }
    next();
  };
}
