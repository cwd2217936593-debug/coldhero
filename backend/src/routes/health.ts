/**
 * 健康检查路由
 * --------------------------------
 *  GET /api/health         基本存活
 *  GET /api/health/deep    深度检查（MySQL / Redis 是否可达）
 */

import { Router } from "express";
import { pool } from "@/db/mysql";
import { redis } from "@/db/redis";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    service: "coldhero-backend",
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get("/deep", async (_req, res) => {
  const result: Record<string, { ok: boolean; error?: string }> = {};

  try {
    await pool.query("SELECT 1");
    result.mysql = { ok: true };
  } catch (e) {
    result.mysql = { ok: false, error: (e as Error).message };
  }

  try {
    const pong = await redis.ping();
    result.redis = { ok: pong === "PONG" };
  } catch (e) {
    result.redis = { ok: false, error: (e as Error).message };
  }

  const allOk = Object.values(result).every((r) => r.ok);
  res.status(allOk ? 200 : 503).json({ success: allOk, checks: result });
});
