/**
 * 认证业务逻辑
 * --------------------------------
 * - register / login 返回 token + 用户公开信息
 * - 任何带敏感字段的对象禁止直接外泄，全部经 toPublicUser 序列化
 */

import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/utils/errors";
import { hashPassword, verifyPassword } from "@/utils/password";
import { signToken } from "@/utils/jwt";
import { logger } from "@/utils/logger";
import {
  toPublicUser,
  usersRepo,
  type PublicUser,
} from "@/modules/users/users.repository";
import type { MemberLevel } from "@/config/memberPlans";
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
} from "@/modules/auth/auth.schema";

export interface AuthResult {
  token: string;
  user: PublicUser;
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
    const token = signToken({
      sub: String(user.id),
      username: user.username,
      role: user.role,
      memberLevel: user.memberLevel,
    });
    logger.info({ userId: user.id, username: user.username }, "用户注册成功");
    return { token, user };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const row = await usersRepo.findByIdentifier(input.identifier);
    // 用户不存在 / 密码错误统一返回相同信息，避免账号枚举
    if (!row) throw new UnauthorizedError("用户名或密码错误");
    if (row.status !== 1) throw new ForbiddenError("账号已被禁用，请联系管理员");

    const ok = await verifyPassword(input.password, row.password_hash);
    if (!ok) throw new UnauthorizedError("用户名或密码错误");

    await usersRepo.updateLastLogin(row.id);

    const user = toPublicUser(row);
    const token = signToken({
      sub: String(user.id),
      username: user.username,
      role: user.role,
      memberLevel: user.memberLevel,
    });
    logger.info({ userId: user.id }, "用户登录成功");
    return { token, user };
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
