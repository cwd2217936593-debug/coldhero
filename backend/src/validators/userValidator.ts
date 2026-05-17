/**
 * 管理端用户管理 — 请求体验证（Zod）
 * --------------------------------
 * 与 `POST/PATCH /api/admin/users*` 等业务对齐；具体唯一性、冷库占用等在 service 层校验。
 */

import { z } from "zod";

export const CreateUserSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/),
  phone: z.string().regex(/^1[3-9]\d{9}$/),
  realName: z.string().min(1).max(32),
  email: z.string().email().optional(),
  role: z.enum(["customer", "technician", "ops_admin"]),
  memberLevel: z.enum(["free", "basic", "professional", "enterprise"]).optional(),
  zoneLimit: z.number().int().min(-1).optional(),
  zoneIds: z.array(z.number().int().positive()).max(50).optional(),
  regionId: z.number().int().positive().optional(),
  memberExpireAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
});

export const UpdateLevelSchema = z.object({
  memberLevel: z.enum(["free", "basic", "professional", "enterprise"]),
  zoneLimit: z.number().int().min(-1).optional(),
  reason: z.string().max(256).optional(),
});

export type CreateUserBody = z.infer<typeof CreateUserSchema>;
export type UpdateLevelBody = z.infer<typeof UpdateLevelSchema>;
