/**
 * 认证业务逻辑
 * --------------------------------
 * - register / login：返回 access JWT + refreshToken + toPublicUser
 * - POST /refresh：用 refresh 换取新 access JWT
 * - 任何带敏感字段的对象禁止直接外泄，全部经 toPublicUser 序列化
 */

import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/utils/errors";
import { hashPassword, verifyPassword } from "@/utils/password";
import { env } from "@/config/env";
import { signToken } from "@/utils/jwt";
import { ttlStringToMs } from "@/utils/ttl";
import { refreshTokensRepo } from "@/modules/auth/refreshTokens.repository";
import { logger } from "@/utils/logger";
import {
  toPublicUser,
  usersRepo,
  type PublicUser,
  type UserRow,
} from "@/modules/users/users.repository";
import type { MemberLevel } from "@/config/memberPlans";
import type {
  ChangePasswordInput,
  LoginInput,
  RefreshInput,
  RegisterInput,
} from "@/modules/auth/auth.schema";

export interface AuthResult {
  token: string;
  refreshToken: string;
  user: PublicUser;
}

export interface RefreshResult {
  token: string;
  user: PublicUser;
}

function ttlRefreshMs(): number {
  return ttlStringToMs(env.JWT_REFRESH_EXPIRES_IN);
}

async function pairForRow(row: UserRow): Promise<{ token: string; refreshToken: string }> {
  const token = signToken({
    sub: String(row.id),
    username: row.username,
    role: row.role,
    memberLevel: row.member_level,
  });
  const { plainRefresh } = await refreshTokensRepo.insert(row.id, ttlRefreshMs());
  return { token, refreshToken: plainRefresh };
}

export const authService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    if (await usersRepo.findByUsername(input.username)) {
      throw new BadRequestError("用户名已存在");
    }
    if (await usersRepo.findByEmail(input.email)) {
      throw new BadRequestError("邮箱已被注册");
    }

    const passwordHash = await hashPassword(input.password);
    const userId = await usersRepo.create({
      username: input.username,
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      phone: input.phone,
      memberLevel: "free",
      role: "viewer",
    });

    const row = await usersRepo.findById(userId);
    if (!row) throw new Error("注册后查询用户失败");

    const user = toPublicUser(row);
    const pair = await pairForRow(row);
    logger.info({ userId: user.id, username: user.username }, "用户注册成功");
    return { ...pair, user };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const row = await usersRepo.findByIdentifier(input.identifier);
    // 用户不存在 / 密码错误统一返回相同信息，避免账号枚举
    if (!row) throw new UnauthorizedError("用户名或密码错误");
    if (row.status !== "active") throw new ForbiddenError("账号已被禁用，请联系管理员");

    const ok = await verifyPassword(input.password, row.password_hash);
    if (!ok) throw new UnauthorizedError("用户名或密码错误");

    await usersRepo.updateLastLogin(row.id);

    const user = toPublicUser(row);
    const pair = await pairForRow(row);
    logger.info({ userId: user.id }, "用户登录成功");
    return { ...pair, user };
  },

  async refresh(input: RefreshInput): Promise<RefreshResult> {
    const hit = await refreshTokensRepo.findValidUserIdByPlain(input.refreshToken);
    if (!hit) throw new UnauthorizedError("refresh 无效或已过期");
    const row = await usersRepo.findById(hit.userId);
    if (!row) throw new UnauthorizedError("用户不存在");
    if (row.status !== "active") throw new ForbiddenError("账号已被禁用，请联系管理员");
    const token = signToken({
      sub: String(row.id),
      username: row.username,
      role: row.role,
      memberLevel: row.member_level,
    });
    return { token, user: toPublicUser(row) };
  },

  async logout(
    userId: number,
    body?: { refreshToken?: string } | undefined,
  ): Promise<void> {
    if (body?.refreshToken) await refreshTokensRepo.revokeRowByPlain(body.refreshToken);
    else await refreshTokensRepo.revokeAllForUser(userId);
  },

  /** 匿名场景：仅靠 refreshToken 单行吊销（如 access 过期后仍要点「退出」）。 */
  async revokeRefreshTokenOnly(plainRefresh: string): Promise<void> {
    await refreshTokensRepo.revokeRowByPlain(plainRefresh);
  },

  async getMe(userId: number): Promise<PublicUser> {
    const row = await usersRepo.findById(userId);
    if (!row) throw new NotFoundError("用户不存在");
    return toPublicUser(row);
  },

  async changePassword(userId: number, input: ChangePasswordInput): Promise<void> {
    const row = await usersRepo.findById(userId);
    if (!row) throw new NotFoundError("用户不存在");
    const ok = await verifyPassword(input.oldPassword, row.password_hash);
    if (!ok) throw new BadRequestError("原密码不正确");
    const newHash = await hashPassword(input.newPassword);
    await usersRepo.updatePassword(userId, newHash);
    await refreshTokensRepo.revokeAllForUser(userId);
    logger.info({ userId }, "用户修改密码成功");
  },

  /**
   * 升级 / 切换会员等级
   * - 此处仅做数据写入；真实付费流程（订单 / 支付回调）将在后续模块对接
   * - 仅允许管理员或本人操作（中间件已限制）
   */
  async upgradeMember(userId: number, level: MemberLevel): Promise<PublicUser> {
    const row = await usersRepo.findById(userId);
    if (!row) throw new NotFoundError("用户不存在");
    await usersRepo.updateMemberLevel(userId, level);
    const updated = await usersRepo.findById(userId);
    logger.info({ userId, level }, "用户会员等级已变更");
    return toPublicUser(updated!);
  },
};
