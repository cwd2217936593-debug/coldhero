/**
 * 扩展 Express Request 类型，注入 req.user
 * --------------------------------
 * 经过 requireAuth 中间件后，req.user 一定存在；
 * 经过 optionalAuth 后，req.user 可能为 undefined。
 */

import type { MemberLevel } from "@/config/memberPlans";

export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "operator" | "viewer";
  memberLevel: MemberLevel;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
