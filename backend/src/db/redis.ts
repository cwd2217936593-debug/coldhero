/**
 * Redis 客户端（ioredis）
 * --------------------------------
 * 用于：
 *  - 每日 AI 问答 / 报告生成配额计数（INCR + EXPIRE）
 *  - 接口频率限流
 *  - BullMQ 任务队列（共用同一连接需开启 maxRetriesPerRequest=null）
 *  - 缓存（短 TTL 热数据）
 */

import Redis, { type RedisOptions } from "ioredis";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

const baseOptions: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  db: env.REDIS_DB,
  lazyConnect: false,
  enableAutoPipelining: true,
  connectTimeout: 5000,
  maxRetriesPerRequest: 3,
};

/** 通用业务连接（计数器 / 缓存 / 限流） */
export const redis = new Redis(baseOptions);

/** BullMQ 专用连接：必须 maxRetriesPerRequest=null */
export const queueConnection = new Redis({
  ...baseOptions,
  maxRetriesPerRequest: null,
});

redis.on("error", (err) => logger.error({ err }, "Redis 连接错误"));
queueConnection.on("error", (err) => logger.error({ err }, "Redis(queue) 连接错误"));

/** 启动期连通性检查 */
export async function pingRedis(): Promise<void> {
  const reply = await redis.ping();
  if (reply !== "PONG") throw new Error(`Redis ping 异常: ${reply}`);
  logger.info({ host: env.REDIS_HOST, db: env.REDIS_DB }, "✅ Redis 连接成功");
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([redis.quit(), queueConnection.quit()]);
}
