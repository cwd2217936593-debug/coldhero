/**
 * 管理员 · 用户 / 账号管理 API
 * --------------------------------
 * 业务入口：`userService`；校验：`CreateUserSchema` / `UpdateLevelSchema` + 路由局部 Zod。
 */

import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { hashPassword } from "@/utils/hash";
import { usersRepo, type UserRole } from "@/modules/users/users.repository";
import { BadRequestError, NotFoundError } from "@/utils/errors";
import { notify } from "@/services/notify";
import type { MemberLevel } from "@/config/memberPlans";
import { getMemberLevelLabel } from "@/constants/memberLevels";
import { CreateUserSchema, UpdateLevelSchema } from "@/validators/userValidator";
import { userService, type ExternalAccountRole } from "@/services/userService";

const router = Router();

function toExternalRole(r: UserRole): "customer" | "technician" | "ops_admin" {
  if (r === "viewer") return "customer";
  if (r === "operator") return "technician";
  return "ops_admin";
}

function actorId(req: { user?: { id: number } }): number {
  const id = req.user?.id;
  if (!id || !Number.isFinite(id)) throw new BadRequestError("未登录");
  return id;
}

const listQuery = z.object({
  role: z.enum(["customer", "technician", "ops_admin", "all"]).optional(),
  memberLevel: z.enum(["free", "basic", "professional", "enterprise"]).optional(),
  keyword: z.string().optional(),
  regionId: z.coerce.number().int().positive().optional(),
  region_id: z.coerce.number().int().positive().optional(),
  status: z.enum(["active", "disabled", "all"]).optional(),
  expiringSoon: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  page: z.coerce.number().int().positive().default(1),
  size: z.coerce.number().int().positive().max(100).default(20),
});

router.get("/", async (req, res) => {
  const q = listQuery.parse(req.query);
  const regionId = q.regionId ?? q.region_id;
  const roleFilter =
    q.role && q.role !== "all"
      ? (q.role as ExternalAccountRole)
      : undefined;
  const status = q.status ?? "active";

  const out = await userService.getUserList({
    role: roleFilter,
    memberLevel: q.memberLevel,
    regionId,
    status,
    keyword: q.keyword,
    expiringSoon: q.expiringSoon === true,
    page: q.page,
    size: q.size,
  });

  const mapped = out.items.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.realName,
    phone: row.phone,
    role: row.role,
    memberLevel: row.memberLevel,
    memberLevelLabel: row.memberLevelLabel,
    regionId: row.regionId,
    regionName: row.regionName,
    status: row.status,
    memberExpireAt: row.memberExpireAt,
    bindZoneCount: row.boundZoneCount,
    zoneLimit: row.zoneLimit,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    createdByName: row.createdByName,
  }));

  res.json({
    success: true,
    data: { items: mapped, total: out.total, page: out.page, size: out.size },
  });
});

router.post("/", async (req, res) => {
  const dto = CreateUserSchema.parse(req.body);
  const created = await userService.createUser(dto, actorId(req));
  res.status(201).json({
    success: true,
    data: {
      id: created.userId,
      userId: created.userId,
      username: created.username,
      role: created.role,
      memberLevel: created.memberLevel,
      boundZones: created.boundZones,
      tempPassword: created.tempPassword,
    },
  });
});

const patchMemberExpireAt = z
  .union([z.null(), z.string().max(32)])
  .optional()
  .transform((s) => {
    if (s === undefined) return undefined;
    if (s === null || s.trim() === "") return null;
    const d = s.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestError("日期须为 YYYY-MM-DD");
    return d;
  });

const patchBody = z.object({
  memberLevel: z.enum(["free", "basic", "professional", "enterprise"]).optional(),
  zoneLimit: z.number().int().min(-1).optional(),
  reason: z.string().max(256).optional(),
  regionId: z.number().int().positive().nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  memberExpireAt: patchMemberExpireAt,
  resetPassword: z.boolean().optional(),
  phone: z.string().max(32).nullable().optional(),
  remark: z.string().max(128).optional(),
  notes: z.string().max(500).optional(),
  email: z.string().email().nullable().optional(),
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError("id 无效");
  const row = await usersRepo.findById(id);
  if (!row) throw new NotFoundError("用户不存在");

  const dto = patchBody.parse(req.body);
  let levelWarning: string | undefined;

  if (dto.memberLevel !== undefined) {
    const r = await userService.updateUserLevel(
      id,
      {
        memberLevel: dto.memberLevel,
        zoneLimit: dto.zoneLimit,
        reason: dto.reason,
      },
      actorId(req),
    );
    levelWarning = r.warning;
  }

  let newPasswordPlain: string | null = null;
  if (dto.resetPassword) {
    newPasswordPlain = crypto.randomBytes(9).toString("base64url").slice(0, 14);
    await usersRepo.updatePassword(id, await hashPassword(newPasswordPlain));
    await notify.send({
      userId: id,
      type: "welcome",
      title: "密码已重置",
      content: `管理员已重置您的密码，新密码：${newPasswordPlain}，请登录后修改。`,
      metadata: {},
    });
  }

  const expireStr =
    dto.memberExpireAt === undefined
      ? undefined
      : dto.memberExpireAt === null
        ? null
        : dto.memberExpireAt;

  await userService.updateUser(id, {
    regionId: dto.regionId,
    memberExpireAt: expireStr,
    phone: dto.phone ?? undefined,
    status: dto.status,
    email: dto.email === undefined || dto.email === null ? undefined : dto.email,
    notes: dto.notes,
    realName:
      dto.remark !== undefined
        ? dto.remark.trim()
          ? `${row.username}（${dto.remark.trim()}）`
          : row.username
        : undefined,
  });

  const next = await usersRepo.findById(id);
  res.json({
    success: true,
    ...(levelWarning ? { warning: levelWarning } : {}),
    data: next
      ? {
          id: next.id,
          username: next.username,
          role: toExternalRole(next.role),
          memberLevel: next.member_level as MemberLevel,
          status: next.status === "active" ? "active" : "disabled",
        }
      : null,
  });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError("id 无效");
  const row = await usersRepo.findById(id);
  if (!row) throw new NotFoundError("用户不存在");

  const { warning } = await userService.disableUser(id);
  res.json({
    success: true,
    data: { userId: id, status: "disabled" as const },
    ...(warning ? { warning } : {}),
  });
});

/** ---------- 子路径须在 /:id 通用 GET 之前注册 ---------- */

router.get("/:id/zones/available", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError("id 无效");
  const keyword = typeof req.query.keyword === "string" ? req.query.keyword : undefined;
  const zones = await userService.listAvailableZones(id, keyword);
  res.json({
    success: true,
    data: zones.map((z) => ({
      id: z.id,
      code: z.code,
      name: z.name,
      deviceSn: z.device_sn,
      isOnline: z.is_online === 1,
      customerId: z.customer_id,
    })),
  });
});

router.get("/:id/zones", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError("id 无效");
  const detail = await userService.getUserDetail(id);
  res.json({ success: true, data: detail.boundZones });
});

router.post("/:id/zones", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError("id 无效");
  const body = z.object({ zoneIds: z.array(z.number().int().positive()) }).parse(req.body);
  await userService.bindZones(id, body.zoneIds, actorId(req));
  res.json({ success: true, data: null });
});

router.delete("/:id/zones/:zoneId", async (req, res) => {
  const id = Number(req.params.id);
  const zoneId = Number(req.params.zoneId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(zoneId) || zoneId <= 0) {
    throw new BadRequestError("id 无效");
  }
  await userService.unbindZone(id, zoneId);
  res.json({ success: true, data: null });
});

router.patch("/:id/level", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError("id 无效");
  const dto = UpdateLevelSchema.parse(req.body);
  const out = await userService.updateUserLevel(id, dto, actorId(req));
  res.json({
    success: true,
    code: "OK",
    data: out.data,
    ...(out.warning ? { warning: out.warning } : {}),
  });
});

router.get("/:id/level-logs", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError("id 无效");
  const detail = await userService.getUserDetail(id);
  res.json({
    success: true,
    data: detail.levelLogs.map((l) => ({
      id: l.id,
      fromLevel: l.from_level,
      toLevel: l.to_level,
      changedBy: l.changed_by,
      reason: l.reason,
      createdAt: l.created_at.toISOString(),
    })),
  });
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError("id 无效");
  const d = await userService.getUserDetail(id);
  res.json({
    success: true,
    data: {
      user: {
        id: d.user.id,
        username: d.user.username,
        email: d.user.email,
        phone: d.user.phone,
        displayName: d.user.display_name,
        role: toExternalRole(d.user.role),
        memberLevel: d.user.member_level as MemberLevel,
        memberLevelLabel: getMemberLevelLabel(d.user.member_level),
        regionId: d.user.region_id,
        regionName: d.regionName,
        status: d.user.status,
        memberExpireAt: ymdIso(d.user.member_expire_at),
        zoneLimit: d.user.zone_limit,
        notes: d.user.notes,
        lastLoginAt: d.user.last_login_at?.toISOString() ?? null,
        createdAt: d.user.created_at.toISOString(),
        createdByName: d.creatorName,
      },
      boundZones: d.boundZones,
      levelLogs: d.levelLogs.map((l) => ({
        id: l.id,
        fromLevel: l.from_level,
        toLevel: l.to_level,
        changedBy: l.changed_by,
        reason: l.reason,
        createdAt: l.created_at.toISOString(),
      })),
      quotas: {
        aiChat: d.quotas.aiChat,
        report: d.quotas.report,
      },
    },
  });
});

function ymdIso(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

const bindBody = z.object({
  zoneIds: z.array(z.number().int().positive()),
});

router.post("/:id/bind-zones", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError("id 无效");
  const dto = bindBody.parse(req.body);
  await userService.syncCustomerZones(id, dto.zoneIds, actorId(req));
  res.json({ success: true, data: null });
});

export default router;
