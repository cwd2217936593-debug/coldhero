/**
 * 会话级 API（fetch 实现，避免 axios 401 拦截与自身形成环状依赖）。
 */

import type { ApiResp, User } from "@/api/types";
import { useAuthStore } from "@/store/authStore";

export async function refreshAuthSession(refreshToken: string): Promise<{ token: string; user: User }> {
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("刷新令牌响应非 JSON");
  }
  const b = body as ApiResp<{ token: string; user: User }>;
  if (!res.ok || !b?.success || !b.data?.token || !b.data?.user) {
    const msg =
      typeof b?.message === "string" ? b.message : `刷新令牌失败（HTTP ${res.status}）`;
    throw new Error(msg);
  }
  return { token: b.data.token, user: b.data.user };
}

export async function logout(): Promise<void> {
  const state = useAuthStore.getState();
  const rt = state.refreshToken;
  const tok = state.token;
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (tok) headers.Authorization = `Bearer ${tok}`;
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers,
      body: JSON.stringify(rt ? { refreshToken: rt } : {}),
    });
  } catch {
    /* ignore */
  } finally {
    useAuthStore.getState().clear();
  }
}
