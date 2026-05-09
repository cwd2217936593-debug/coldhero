/**
 * 用户与会员等级路由
 *  GET    /api/users/me/plan       当前会员套餐详情（含每日配额上限）
 *  PATCH  /api/users/me            修改个人资料（昵称/手机号/头像）
 *  POST   /api/users/:id/upgrade   切换会员等级（仅管理员；后续付费回调会替换为内部接口）
 */

import { Router } from "express";
import { z } from "zod";
import { authService } from "@/modules/auth/auth.service";
import { upgradeMemberSchema } from "@/modules/auth/auth.schema";
import { requireAuth, requireRole } from "@/middlewares/auth";
import { getPlan } from "@/config/memberPlans";
import { usersRepo, toPublicUser } from "@/modules/users/users.repository";
import { BadRequestError, NotFoundError } from "@/utils/errors";
import { quotaService } from "@/modules/quota/quota.service";

export const usersRouter = Router();

usersRouter.get("/me/plan", requireAuth, (req, res) => {
  const plan = getPlan(req.user!.memberLevel);
  res.json({ success: true, data: plan });
});

/** 查询今日配额使用情况（不消费） */
usersRouter.get("/me/quota", requireAuth, async (req, res) => {
  const plan = getPlan(req.user!.memberLevel);
  const [aiChat, report] = await Promise.all([
    quotaService.peek(req.user!.id, plan, "aiChat"),
    quotaService.peek(req.user!.id, plan, "report"),
  ]);
  res.json({
    success: true,
    data: {
      memberLevel: req.user!.memberLevel,
      aiChat,
      report,
      timezone: "Asia/Shanghai",
    },
  });
});

const profilePatchSchema = z.object({
  displayName: z.string().max(64).optional(),
  phone: z
    .string()
    .regex(/^\d{6,20}$/, "手机号格式不正确")
    .nullable()
    .optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

usersRouter.patch("/me", requireAuth, async (req, res) => {
  const patch = profilePatchSchema.parse(req.body);
  await usersRepo.updateProfile(req.user!.id, patch);
  const row = await usersRepo.findById(req.user!.id);
  if (!row) throw new NotFoundError("用户不存在");
  res.json({ success: true, data: toPublicUser(row) });
});

usersRouter.post(
  "/:id/upgrade",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new BadRequestError("用户 ID 无效");
    }
    const { memberLevel } = upgradeMemberSchema.parse(req.body);
    const updated = await authService.upgradeMember(userId, memberLevel);
    res.json({ success: true, data: updated });
  },
);
