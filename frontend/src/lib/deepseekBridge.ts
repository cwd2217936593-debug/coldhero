/**
 * Mock + 真实 DeepSeek 混合模式
 * ------------------------------
 * 当 VITE_USE_MOCK=1 且配置了 VITE_API_BASE_URL 时：
 * - 登录 / 用户信息 / 会员配额等走真实后端
 * - 仅「管理员」的问答走真实 /api/chat/* → 后端 DeepSeek（流式同）
 * - 非管理员仍走前端 Mock（演示文案，见 mock/index.ts）
 */

import type { User } from "@/api/types";
import { useAuthStore } from "@/store/authStore";

/** 与 mock 的 currentUserFromStore 一致：避免 persist 尚未 rehydrate 时 user 为 null，误判不能走 DeepSeek */
export function getUserForChatGate(): User | null {
  const fromStore = useAuthStore.getState().user;
  if (fromStore) return fromStore;
  try {
    const raw = localStorage.getItem("coldhero-auth");
    if (raw) return JSON.parse(raw).state.user as User;
  } catch {
    /* ignore */
  }
  return null;
}

/** 与 getUserForChatGate 同理：persist 未 rehydrate 时从 localStorage 取 token，避免流式请求无 Authorization */
export function getTokenForChatGate(): string | null {
  const fromStore = useAuthStore.getState().token;
  if (fromStore) return fromStore;
  try {
    const raw = localStorage.getItem("coldhero-auth");
    if (raw) return JSON.parse(raw).state.token as string | null;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 后端根地址（无尾斜杠）。
 *
 * **仅使用 `VITE_API_BASE_URL`** 判断是否「Mock + 真后端」混合模式；
 * 不可在 DEV 默认假定为 localhost:4000，否则仅开 `VITE_USE_MOCK=1`（纯前端演示）也会被当成混合模式，
 * 登录 / 健康探测会强制走代理并出现 ECONNREFUSED。
 *
 * Vite `/api` 代理默认仍可指向 localhost:4000（见 vite.config）；`VITE_USE_MOCK=0` 或不设 Mock 时不走本分支。
 */
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
  return user?.role === "admin";
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

  if ((pathKey === "health" || pathKey === "health/deep") && m === "get") return true;
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
  return canUseRealDeepseekChat(getUserForChatGate());
}

/**
 * 开发环境 + 混合 Mock：请求走「当前页同源 /api」，由 Vite 代理到 VITE_API_BASE_URL，
 * 避免浏览器直连后端端口触发 CORS 失败。
 */
export function relayApiViaViteProxyInDev(): boolean {
  return import.meta.env.DEV && isHybridMockWithBackend();
}

/** 将 axios 请求转到外部域名（保留 /api 前缀路径） */
export function applyExternalApiBaseUrl(cfg: { baseURL?: string; url?: string }): void {
  const origin = getExternalApiOrigin()!;
  const key = axiosPathKey(cfg);
  cfg.baseURL = origin;
  cfg.url = `/api/${key}`;
}
