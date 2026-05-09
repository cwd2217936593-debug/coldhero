/**
 * 站内消息路由
 *  GET   /api/notifications              当前用户消息列表（含广播）
 *  GET   /api/notifications/unread-count 未读总数
 *  POST  /api/notifications/mark-read    批量已读 { ids: number[] }
 *  POST  /api/notifications/mark-all-read 全部已读
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "@/middlewares/auth";
import {
  notificationsRepo,
  toPublicNotification,
} from "@/modules/notifications/notifications.repository";

export const notificationsRouter = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

notificationsRouter.get("/", requireAuth, async (req, res) => {
  const q = listQuerySchema.parse(req.query);
  const list = await notificationsRepo.listForUser(req.user!.id, q);
  res.json({ success: true, data: list.map(toPublicNotification) });
});

notificationsRouter.get("/unread-count", requireAuth, async (req, res) => {
  const count = await notificationsRepo.countUnread(req.user!.id);
  res.json({ success: true, data: { count } });
});

const markReadSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

notificationsRouter.post("/mark-read", requireAuth, async (req, res) => {
  const { ids } = markReadSchema.parse(req.body);
  await notificationsRepo.markRead(req.user!.id, ids);
  res.json({ success: true });
});

notificationsRouter.post("/mark-all-read", requireAuth, async (req, res) => {
  await notificationsRepo.markAllRead(req.user!.id);
  res.json({ success: true });
});
