/**
 * 管理员身份校验中间件
 * --------------------------------
 * 典型用法：`router.use(requireAuth, requireAdminAuth)`。
 *
 * - `requireAdminAuth`：平台工作台入口（工单、监控…），允许 `admin | operator`
 * - `requireStrictAdminAuth`：账号档案、等级、区域元数据管理等，仅 `role=admin`
 *   （维修人员 `operator` 仍可用派单/监控，但不可改客户会员档位，贴合提示词「运维 / 超管」分流）
 *
 * 失败：抛 ForbiddenError → HTTP 403 `{ code: "FORBIDDEN", ... }`
 */

import type { RequestHandler } from "express";
import { ForbiddenError } from "@/utils/errors";
import type { AuthUser } from "@/types/express";

/** 与 DB `users.role` 一致的业务角色枚举 */
export function isPlatformAdminRole(role: AuthUser["role"]): boolean {
  return role === "admin" || role === "operator";
}

export const requireAdminAuth: RequestHandler = (req, _res, next) => {
  const u = req.user;
  if (!u || !isPlatformAdminRole(u.role)) {
    throw new ForbiddenError("无管理员权限");
  }
  next();
};

/** 仅限「管理员账号」：`admin`。拒绝客户 `viewer`、维修账号 `operator`。 */
export const requireStrictAdminAuth: RequestHandler = (req, _res, next) => {
  const u = req.user;
  if (!u || u.role !== "admin") {
    throw new ForbiddenError("需要超级管理员权限");
  }
  next();
};