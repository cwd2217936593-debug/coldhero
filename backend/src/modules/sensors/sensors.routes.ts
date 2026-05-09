/**
 * 传感器路由
 *  POST  /api/sensors/ingest         单点写入（admin/operator） → 触发实时推送 + 异常告警
 *  POST  /api/sensors/ingest/batch   批量写入（admin/operator）
 *  GET   /api/sensors/zones          所有库区当前快照（含异常标记） → 概览卡片用
 *  GET   /api/sensors/zones/:id/series  实时/历史曲线（默认 2h）
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "@/middlewares/auth";
import { enforceHistoryRange } from "@/middlewares/historyRange";
import { BadRequestError, NotFoundError } from "@/utils/errors";
import {
  sensorIngestSchema,
  sensorBatchIngestSchema,
  sensorSeriesQuerySchema,
} from "@/modules/sensors/sensors.schema";
import { sensorsService } from "@/modules/sensors/sensors.service";
import {
  sensorsRepo,
  toPublicSensor,
} from "@/modules/sensors/sensors.repository";
import { zonesRepo, toPublicZone } from "@/modules/zones/zones.repository";
import { historyService, type Bucket } from "@/modules/sensors/history.service";
import { forecastService } from "@/modules/forecast/forecast.service";

export const sensorsRouter = Router();

sensorsRouter.post(
  "/ingest",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const body = sensorIngestSchema.parse(req.body);
    const result = await sensorsService.ingest(body);
    res.status(201).json({ success: true, data: result });
  },
);

sensorsRouter.post(
  "/ingest/batch",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const { items } = sensorBatchIngestSchema.parse(req.body);
    const results = [];
    for (const it of items) {
      results.push(await sensorsService.ingest(it));
    }
    res.status(201).json({ success: true, data: { count: results.length, results } });
  },
);

/** 全部库区快照（每库区取最新一条 + 静态阈值，前端温度概览卡片直接渲染） */
sensorsRouter.get("/zones", requireAuth, async (_req, res) => {
  const [zones, latest] = await Promise.all([
    zonesRepo.list(),
    sensorsRepo.latestPerZone(),
  ]);
  const latestMap = new Map(latest.map((r) => [r.zone_id, r]));
  const data = zones.map((z) => {
    const r = latestMap.get(z.id);
    return {
      zone: toPublicZone(z),
      latest: r ? toPublicSensor(r) : null,
    };
  });
  res.json({ success: true, data });
});

/** 单库区时序曲线（实时 / 短窗，不做强制范围检查） */
sensorsRouter.get("/zones/:id/series", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new BadRequestError("id 无效");
  const zone = await zonesRepo.findById(id);
  if (!zone) throw new NotFoundError("库区不存在");

  const q = sensorSeriesQuerySchema.parse(req.query);
  const { from, to } = resolveTimeRange(q);
  const limit = q.limit ?? 5000;
  const rows = await sensorsRepo.seriesByZone(id, from, to, limit);
  res.json({
    success: true,
    data: {
      zone: toPublicZone(zone),
      from,
      to,
      points: rows.map(toPublicSensor),
    },
  });
});

const historyQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  bucket: z.enum(["raw", "5min", "1h", "1d"]).optional(),
});

/**
 * 历史曲线（受会员等级范围限制 + 自动选桶）
 */
sensorsRouter.get(
  "/zones/:id/history",
  requireAuth,
  enforceHistoryRange,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw new BadRequestError("id 无效");
    const zone = await zonesRepo.findById(id);
    if (!zone) throw new NotFoundError("库区不存在");
    const { bucket } = historyQuerySchema.parse(req.query);
    const { fromAt, toAt } = res.locals.historyRange as { fromAt: Date; toAt: Date };
    const result = await historyService.query(id, fromAt, toAt, bucket as Bucket | undefined);
    res.json({
      success: true,
      data: {
        zone: toPublicZone(zone),
        from: fromAt,
        to: toAt,
        ...result,
      },
    });
  },
);

/** AI 模型预测曲线（虚线） */
sensorsRouter.get(
  "/zones/:id/forecast",
  requireAuth,
  enforceHistoryRange,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw new BadRequestError("id 无效");
    const { fromAt, toAt } = res.locals.historyRange as { fromAt: Date; toAt: Date };
    const result = await forecastService.load(id, fromAt, toAt);
    res.json({ success: true, data: result });
  },
);

/** 实际 vs 预测对比 + 拟合误差（前端图叠两条线） */
sensorsRouter.get(
  "/zones/:id/compare",
  requireAuth,
  enforceHistoryRange,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw new BadRequestError("id 无效");
    const { fromAt, toAt } = res.locals.historyRange as { fromAt: Date; toAt: Date };
    const result = await forecastService.compare(id, fromAt, toAt);
    res.json({ success: true, data: result });
  },
);

function resolveTimeRange(q: { window?: string; from?: Date; to?: Date }): { from: Date; to: Date } {
  if (q.from && q.to) return { from: q.from, to: q.to };
  const to = q.to ?? new Date();
  const w = parseWindow(q.window ?? "2h");
  return { from: new Date(to.getTime() - w), to };
}

function parseWindow(s: string): number {
  const m = /^(\d+)([hd])$/.exec(s);
  if (!m) return 2 * 3600 * 1000;
  const n = parseInt(m[1], 10);
  return m[2] === "h" ? n * 3600 * 1000 : n * 86400 * 1000;
}
