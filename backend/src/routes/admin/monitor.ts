/**
 * 管理员 · 设备监控 API（提示词 Step 6）
 * --------------------------------
 * GET /overview | /customers | /customers/:id/zones | /zones/:id/realtime | /alerts
 * 超标/离线判定阈值由 `adminMonitorService` 读环境变量，见 `config/env.ts`。
 */

import { Router } from "express";
import { z } from "zod";
import { adminMonitorService } from "@/services/adminMonitor.service";
import { BadRequestError } from "@/utils/errors";

const router = Router();

router.get("/overview", async (_req, res) => {
  const data = await adminMonitorService.overview();
  res.json({ success: true, data });
});

const customerListQuery = z.object({
  region_id: z.coerce.number().optional(),
  status: z.enum(["online", "offline", "alert"]).optional(),
  keyword: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  size: z.coerce.number().int().positive().max(200).default(20),
});

router.get("/customers", async (req, res) => {
  const q = customerListQuery.parse(req.query);
  const data = await adminMonitorService.listCustomers({
    regionId: q.region_id,
    status: q.status,
    keyword: q.keyword,
    page: q.page,
    size: q.size,
  });
  res.json({ success: true, data });
});

router.get("/customers/:customerId/zones", async (req, res) => {
  const customerId = Number(req.params.customerId);
  if (!Number.isFinite(customerId) || customerId <= 0) throw new BadRequestError("customerId 无效");
  const data = await adminMonitorService.zonesForCustomer(customerId);
  res.json({ success: true, data });
});

router.get("/zones/:zoneId/realtime", async (req, res) => {
  const zoneId = Number(req.params.zoneId);
  if (!Number.isFinite(zoneId) || zoneId <= 0) throw new BadRequestError("zoneId 无效");
  const data = await adminMonitorService.zoneRealtime(zoneId);
  if (!data) throw new BadRequestError("库区不存在");
  res.json({ success: true, data });
});

router.get("/alerts", async (_req, res) => {
  const data = await adminMonitorService.alerts();
  res.json({ success: true, data });
});

export default router;
