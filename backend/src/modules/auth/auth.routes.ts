/**
 * 认证路由
 *  POST /api/auth/register   注册
 *  POST /api/auth/login      登录
 *  POST /api/auth/logout     前端清 token 即可，这里仅记录日志
 *  GET  /api/auth/me         查询当前登录用户
 *  POST /api/auth/change-password  修改密码
 */

import { Router } from "express";
import { authService } from "@/modules/auth/auth.service";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
} from "@/modules/auth/auth.schema";
import { requireAuth } from "@/middlewares/auth";
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

authRouter.post("/logout", requireAuth, (req, res) => {
  // JWT 是无状态的：服务端不维护黑名单时，"登出"仅由前端丢弃 token 完成。
  // 如需强制吊销，可后续引入 Redis 黑名单（jti+exp）。
  logger.info({ userId: req.user!.id }, "用户登出");
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
