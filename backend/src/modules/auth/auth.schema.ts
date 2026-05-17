/**
 * 认证模块请求体校验 schema
 * --------------------------------
 * 在路由层做 .parse(req.body)，类型 + 业务规则一处定义
 */

import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, "用户名至少 3 位")
    .max(32, "用户名最多 32 位")
    .regex(/^[a-zA-Z0-9_]+$/, "仅支持字母、数字、下划线"),
  email: z.string().email("邮箱格式不正确").max(128),
  password: z
    .string()
    .min(8, "密码至少 8 位")
    .max(64, "密码最多 64 位")
    .regex(/[A-Za-z]/, "密码需包含字母")
    .regex(/[0-9]/, "密码需包含数字"),
  displayName: z.string().max(64).optional(),
  phone: z
    .string()
    .regex(/^\d{6,20}$/, "手机号格式不正确")
    .optional(),
});

export const loginSchema = z.object({
  /** 支持用户名或邮箱登录 */
  identifier: z.string().min(3, "请输入用户名或邮箱").max(128),
  password: z.string().min(1, "请输入密码").max(64),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(40, "refreshToken 无效"),
});

/** 注销：可不传 refreshToken（则吊销该用户在库内全部 refresh）；传则仅吊销当前会话 */
export const logoutBodySchema = z
  .object({
    refreshToken: z.string().min(40).optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, "请输入原密码"),
    newPassword: z
      .string()
      .min(8, "新密码至少 8 位")
      .max(64)
      .regex(/[A-Za-z]/, "新密码需包含字母")
      .regex(/[0-9]/, "新密码需包含数字"),
  })
  .refine((d) => d.oldPassword !== d.newPassword, {
    message: "新密码不能与原密码相同",
    path: ["newPassword"],
  });

export const upgradeMemberSchema = z.object({
  memberLevel: z.enum(["free", "basic", "professional", "enterprise"]),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type UpgradeMemberInput = z.infer<typeof upgradeMemberSchema>;
