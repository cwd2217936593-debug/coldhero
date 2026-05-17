import { api } from "@/api/client";
import type { ApiResp, AuthResult, MemberPlan, QuotaState, User } from "@/api/types";

function unwrapData<T>(r: { data: ApiResp<T> }, action: string): T {
  const body = r.data;
  if (!body?.success || body.data === undefined || body.data === null) {
    const msg = body?.message ?? `${action}失败：服务端未返回有效数据（请确认后端已启动、数据库已 seed，或开启 VITE_USE_MOCK=1）`;
    throw new Error(msg);
  }
  return body.data;
}

export async function login(identifier: string, password: string): Promise<AuthResult> {
  const r = await api.post<ApiResp<AuthResult>>("/auth/login", { identifier, password });
  const out = unwrapData(r, "登录");
  if (!out.token || !out.user || !out.refreshToken) {
    throw new Error("登录响应缺少 token / refreshToken 或用户信息（请确认后端已实现双 Token）");
  }
  return out;
}

export async function register(input: {
  username: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const r = await api.post<ApiResp<AuthResult>>("/auth/register", input);
  const out = unwrapData(r, "注册");
  if (!out.token || !out.user || !out.refreshToken) {
    throw new Error("注册响应缺少 token / refreshToken 或用户信息（请确认后端已实现双 Token）");
  }
  return out;
}

export async function getMe(): Promise<User> {
  const r = await api.get<ApiResp<User>>("/auth/me");
  return unwrapData(r, "获取用户信息");
}

export async function getMyPlan(): Promise<MemberPlan> {
  const r = await api.get<ApiResp<MemberPlan>>("/users/me/plan");
  return unwrapData(r, "获取会员方案");
}

export async function getMyQuota(): Promise<{
  aiChat: QuotaState;
  report: QuotaState;
}> {
  const r = await api.get<ApiResp<{ aiChat: QuotaState; report: QuotaState }>>(
    "/users/me/quota",
  );
  return unwrapData(r, "获取配额");
}

export { logout, refreshAuthSession } from "./session";