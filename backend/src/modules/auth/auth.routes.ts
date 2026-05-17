/**
 * 认证路由（前缀在 routes/index 中挂到 `/auth` → `/api/auth/*`）。
 * - register / login：返回 access JWT + refreshToken
 * - refresh：换发 access
 * - logout：吊销 refresh 行
 */

import { Router } from "express";
import { authService } from "@/modules/auth/auth.service";
import {
  changePasswordSchema,
  loginSchema,
  logoutBodySchema,
  refreshSchema,
  registerSchema,
} from "@/modules/auth/auth.schema";
import { optionalAuth, requireAuth } from "@/middlewares/auth";
import { rateLimit } from "@/middlewares/rateLimit";
import { logger } from "@/utils/logger";

export const authRouter = Router();

/** 每个 IP 每分钟最多 5 次注册（防止脚本注册） */
const registerLimiter = rateLimit({
  name: "auth:register",
  window: 60,
  max: 5,
  keyBy: "ip",
  message: "注册过于频繁，请稍后再试",
});

/** 每个 IP 每分钟最多 10 次登录尝试（防止暴力破解） */
const loginLimiter = rateLimit({
  name: "auth:login",
  window: 60,
  max: 10,
  keyBy: "ip",
  message: "登录尝试过于频繁，请稍后再试",
});

const refreshLimiter = rateLimit({
  name: "auth:refresh",
  window: 60,
  max: 30,
  keyBy: "ip",
  message: "刷新令牌过于频繁，请稍后再试",
});

authRouter.post("/register", registerLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input);
  res.status(201).json({ success: true, data: result });
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input);
  res.json({ success: true, data: result });
});

/**
 * Refresh：换发新的 Access JWT（需有效 refresh_token，库内仅存摘要）。
 */
authRouter.post("/refresh", refreshLimiter, async (req, res) => {
  const body = refreshSchema.parse(req.body);
  const result = await authService.refresh(body);
  res.json({ success: true, data: result });
});

/**
 * Logout：吊销 refresh。
 * - 已登录：默认吊销该用户全部 refresh；若 body 带 refreshToken 则只吊销该会话。
 * - 未登录：仅当 body 带 refreshToken 时尝试吊销（方便纯本地清会话）。
 */
authRouter.post("/logout", optionalAuth, async (req, res) => {
  const parsed = logoutBodySchema.parse(req.body ?? {});
  if (req.user) {
    await authService.logout(req.user.id, parsed);
    logger.info({ userId: req.user.id }, "用户登出");
  } else if (parsed.refreshToken) {
    await authService.revokeRefreshTokenOnly(parsed.refreshToken);
  }
  res.json({ success: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await authService.getMe(req.user!.id);
  res.json({ success: true, data: user });
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const input = changePasswordSchema.parse(req.body);
  await authService.changePassword(req.user!.id, input);
  res.json({ success: true });
});
