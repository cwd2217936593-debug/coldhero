/**
 * 库区路由
 *  GET    /api/zones                列表
 *  GET    /api/zones/public         橱窗页用：仅 is_public=1 的库区，无需登录
 *  GET    /api/zones/:id            详情
 *  POST   /api/zones                创建（admin）
 *  PATCH  /api/zones/:id            更新（admin）
 *  DELETE /api/zones/:id            删除（admin）
 */

import { Router } from "express";
import { requireAuth, requireRole, optionalAuth } from "@/middlewares/auth";
import { BadRequestError, NotFoundError } from "@/utils/errors";
import { toPublicZone, zonesRepo } from "@/modules/zones/zones.repository";
import {
  zoneCreateSchema,
  zoneUpdateSchema,
} from "@/modules/zones/zones.schema";

export const zonesRouter = Router();

zonesRouter.get("/public", optionalAuth, async (_req, res) => {
  const list = await zonesRepo.list({ onlyPublic: true });
  res.json({ success: true, data: list.map(toPublicZone) });
});

zonesRouter.get("/", requireAuth, async (_req, res) => {
  const list = await zonesRepo.list();
  res.json({ success: true, data: list.map(toPublicZone) });
});

zonesRouter.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new BadRequestError("id 无效");
  const row = await zonesRepo.findById(id);
  if (!row) throw new NotFoundError("库区不存在");
  res.json({ success: true, data: toPublicZone(row) });
});

zonesRouter.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const body = zoneCreateSchema.parse(req.body);
  if (body.tempMin > body.tempMax) {
    throw new BadRequestError("tempMin 必须 <= tempMax");
  }
  if (await zonesRepo.findByCode(body.code)) {
    throw new BadRequestError("库区编码已存在");
  }
  const id = await zonesRepo.create(body);
  const row = await zonesRepo.findById(id);
  res.status(201).json({ success: true, data: toPublicZone(row!) });
});

zonesRouter.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new BadRequestError("id 无效");
  const exists = await zonesRepo.findById(id);
  if (!exists) throw new NotFoundError("库区不存在");
  const patch = zoneUpdateSchema.parse(req.body);
  if (patch.tempMin !== undefined && patch.tempMax !== undefined && patch.tempMin > patch.tempMax) {
    throw new BadRequestError("tempMin 必须 <= tempMax");
  }
  await zonesRepo.update(id, patch);
  const row = await zonesRepo.findById(id);
  res.json({ success: true, data: toPublicZone(row!) });
});

zonesRouter.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new BadRequestError("id 无效");
  await zonesRepo.remove(id);
  res.json({ success: true });
});
