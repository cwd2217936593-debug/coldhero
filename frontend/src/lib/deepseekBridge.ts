/**
 * Mock + 真实 DeepSeek 混合模式
 * ------------------------------
 * 当 VITE_USE_MOCK=1 且配置了 VITE_API_BASE_URL 时：
 * - 登录 / 用户信息 / 会员配额等走真实后端（与种子账号一致即可拿 JWT）
 * - 仅「管理员」或「企业版」会员的问答（含流式）请求真实 /api/chat/*，由后端调用 DeepSeek
 * - 其余接口仍为前端 Mock，便于静态演示
 */

import type { User } from "@/api/types";
import { useAuthStore } from "@/store/authStore";

export function getExternalApiOrigin(): string | null {
  const v = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!v) return null;
  return v.replace(/\/$/, "");
}

/** Mock 开启且配置了外接 API 根地址 */
export function isHybridMockWithBackend(): boolean {
  return import.meta.env.VITE_USE_MOCK === "1" && !!getExternalApiOrigin();
}

export function canUseRealDeepseekChat(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.role === "admin" || user.memberLevel === "enterprise";
}

/** 将 axios 请求里的 path 规范成 `auth/login`、`chat/sessions/xxx/messages` 形式（无 api/ 前缀） */
export function axiosPathKey(cfg: { url?: string }): string {
  let u = String(cfg.url ?? "");
  u = u.replace(/^\/?api\/?/i, "");
  return u.replace(/^\/+/, "");
}

function isChatApiPath(pathKey: string, method: string): boolean {
  const m = method.toLowerCase();
  if (pathKey === "chat/messages" && m === "post") return true;
  if (pathKey === "chat/sessions" && m === "get") return true;
  if (/^chat\/sessions\/[^/]+\/messages$/.test(pathKey) && m === "get") return true;
  return false;
}

/**
 * 在 Mock axios 拦截器里：这些请求改用真实后端（不设自定义 adapter）
 *
 * @param user 当前登录用户；未登录时仅 auth 类接口可为 true
 */
export function shouldBypassMockAdapter(
  method: string,
  pathKey: string,
  user: User | null,
): boolean {
  if (!isHybridMockWithBackend()) return false;
  const m = method.toLowerCase();

  if (pathKey === "auth/login" && m === "post") return true;
  if (pathKey === "auth/register" && m === "post") return true;
  if (pathKey === "auth/logout" && m === "post") return true;
  if (pathKey === "auth/me" && m === "get") return true;
  if (pathKey === "users/me/plan" && m === "get") return true;
  if (pathKey === "users/me/quota" && m === "get") return true;

  if (!isChatApiPath(pathKey, m)) return false;
  return canUseRealDeepseekChat(user);
}

/** 外接 API + 当前用户允许时，流式问答走真实 fetch */
export function shouldChatStreamHitRealBackend(): boolean {
  if (!isHybridMockWithBackend()) return false;
  return canUseRealDeepseekChat(useAuthStore.getState().user);
}

/** 将 axios 请求转到外部域名（保留 /api 前缀路径） */
export function applyExternalApiBaseUrl(cfg: { baseURL?: string; url?: string }): void {
  const origin = getExternalApiOrigin()!;
  const key = axiosPathKey(cfg);
  cfg.baseURL = origin;
  cfg.url = `/api/${key}`;
}
