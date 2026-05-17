/**
 * JWT 签发与验证
 * --------------------------------
 * - Access Token：HS256，`env.JWT_SECRET`，过期 `env.JWT_EXPIRES_IN`
 * - Refresh Token：独立表 `refresh_tokens` 存 SHA-256(raw)；本文件不签 refresh
 */

import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "@/config/env";
import { normalizeMemberLevel, type MemberLevel } from "@/config/memberPlans";
import { UnauthorizedError } from "@/utils/errors";

export interface JwtPayload {
  /** 用户 ID（数字 → 字符串，避免大整数精度问题） */
  sub: string;
  username: string;
  role: "admin" | "operator" | "viewer";
  memberLevel: MemberLevel;
}

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    issuer: env.APP_NAME,
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: env.APP_NAME });
    if (typeof decoded === "string") {
      throw new UnauthorizedError("无效的 token 载荷");
    }
    const { sub, username, role, memberLevel } = decoded as JwtPayload & jwt.JwtPayload;
    if (!sub || !username || !role || !memberLevel) {
      throw new UnauthorizedError("token 缺少必要字段");
    }
    return { sub, username, role, memberLevel: normalizeMemberLevel(String(memberLevel)) };
  } catch (e) {
    if (e instanceof UnauthorizedError) throw e;
    throw new UnauthorizedError("token 无效或已过期");
  }
}
