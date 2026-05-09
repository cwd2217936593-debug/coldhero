/**
 * 认证 / 鉴权中间件
 * --------------------------------
 * - requireAuth：必须登录；解析 JWT 后注入 req.user
 * - optionalAuth：尝试解析；失败不报错（用于公开页可记录身份）
 * - requireRole：仅指定角色可访问（admin / operator / viewer）
 * - requirePlan：按会员等级控制功能开关（如 Word 导出仅 basic+）
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "@/utils/errors";
import { verifyToken } from "@/utils/jwt";
import { getPlan, type MemberPlan } from "@/config/memberPlans";
import type { UserRole } from "@/modules/users/users.repository";

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  // 也允许从 query/cookie 取（前端某些场景方便），暂时只用 header
  return null;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw new UnauthorizedError("缺少访问令牌");
  const payload = verifyToken(token);
  req.user = {
    id: Number(payload.sub),
    username: payload.username,
    role: payload.role,
    memberLevel: payload.memberLevel,
  };
  next();
};

export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    req.user = {
      id: Number(payload.sub),
      username: payload.username,
      role: payload.role,
      memberLevel: payload.memberLevel,
    };
  } catch {
    // 静默忽略，作为匿名访问
  }
  next();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  const allow = new Set(roles);
  return (req, _res, next) => {
    if (!req.user) throw new UnauthorizedError();
    if (!allow.has(req.user.role)) {
      throw new ForbiddenError(`需要以下角色之一才能访问：${[...allow].join("/")}`);
    }
    next();
  };
}

/**
 * requirePlan：基于会员套餐特性的细粒度授权
 * 用法：
 *   requirePlan((plan) => plan.allowDocxExport)
 *   requirePlan((plan) => plan.apiAccess)
 *
 * 也可指定升级提示（错误响应 details 含 upgradeHint）。
 */
export function requirePlan(
  predicate: (plan: MemberPlan) => boolean,
  upgradeHint = "当前会员等级不支持此功能，请升级套餐",
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    const plan = getPlan(req.user.memberLevel);
    if (!predicate(plan)) {
      throw new ForbiddenError(upgradeHint);
    }
    next();
  };
}
