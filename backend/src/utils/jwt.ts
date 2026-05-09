/**
 * JWT 签发与验证
 * --------------------------------
 * - 仅使用 HS256（密钥来自 env.JWT_SECRET）
 * - 业务侧拿到的 payload 通过 verifyToken 自动校验签名 + 过期
 */

import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "@/config/env";
import type { MemberLevel } from "@/config/memberPlans";
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
    return { sub, username, role, memberLevel };
  } catch (e) {
    if (e instanceof UnauthorizedError) throw e;
    throw new UnauthorizedError("token 无效或已过期");
  }
}
