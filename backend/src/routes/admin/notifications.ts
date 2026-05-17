/**
 * 管理员 · 站内信发送 API（复用 notifications 表）
 */

import { Router } from "express";
import { z } from "zod";
import { notify } from "@/services/notify";

const router = Router();

const typeEnum = z.enum([
  "order_assigned",
  "order_completed",
  "order_rejected",
  "fault_no_tech",
  "fault_new",
  "member_expiring",
  "member_followup",
  "welcome",
]);

const sendBody = z.object({
  userId: z.number().int().positive(),
  type: typeEnum,
  title: z.string().min(1).max(64),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

router.post("/", async (req, res) => {
  const raw = sendBody.parse(req.body);
  const id = await notify.send({
    userId: raw.userId,
    type: raw.type,
    title: raw.title,
    content: raw.content,
    metadata: raw.metadata,
  });
  res.status(201).json({ success: true, data: { id } });
});

export default router;
