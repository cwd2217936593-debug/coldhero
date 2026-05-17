import axios, { AxiosError } from "axios";
import { axiosPathKey, getRefreshTokenForChatGate, getTokenForChatGate } from "@/lib/deepseekBridge";
import { refreshAuthSession } from "@/api/session";
import { useAuthStore } from "@/store/authStore";
import type { ApiResp } from "@/api/types";

export const api = axios.create({
  baseURL: "/api",
  timeout: 30_000,
});

// 自动注入 JWT（persist 尚未 rehydrate 到内存时，从 localStorage 兜底，避免先发 401 被 clear 冲掉登录态）
api.interceptors.request.use((cfg) => {
  const token = getTokenForChatGate();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

/** 聚合并发 401→避免重复 refresh */
let refreshFlight: Promise<void> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError<ApiResp<never>>) => {
    const status = err.response?.status;
    const cfg = err.config;
    if (status !== 401 || !cfg) return Promise.reject(err);

    const pathKey = axiosPathKey(cfg);
    if (
      pathKey.startsWith("auth/login") ||
      pathKey.startsWith("auth/register") ||
      pathKey.startsWith("auth/refresh")
    ) {
      useAuthStore.getState().clear();
      return Promise.reject(err);
    }

    const rt = useAuthStore.getState().refreshToken ?? getRefreshTokenForChatGate();
    const retried = Boolean((cfg as { _retry401?: boolean })._retry401);
    if (!rt || retried) {
      useAuthStore.getState().clear();
      return Promise.reject(err);
    }

    (cfg as { _retry401?: boolean })._retry401 = true;

    try {
      refreshFlight ??= (async () => {
        try {
          const { token, user } = await refreshAuthSession(rt);
          useAuthStore.getState().patchAccess(token, user);
        } finally {
          refreshFlight = null;
        }
      })();
      await refreshFlight;

      cfg.headers = cfg.headers ?? {};
      const nextTok = useAuthStore.getState().token;
      if (!nextTok) throw new Error("no token after refresh");
      cfg.headers.Authorization = `Bearer ${nextTok}`;
      return api.request(cfg);
    } catch {
      useAuthStore.getState().clear();
      return Promise.reject(err);
    }
  },
);

/** 从各类响应体中抽出可读说明（JSON/HTML/纯文本） */
export function errMessage(err: unknown): string {
  const e = err as AxiosError<ApiResp<never>>;
  const st = e?.response?.status;
  const raw: unknown = e?.response?.data;
  const apiHint = `请确认后端已监听 ${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}，并已执行 docker compose up -d mysql redis（或本机启动 MySQL/Redis），再运行 npm run dev / 后端 npm run dev。`;

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const k of ["message", "msg", "error", "detail"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v;
    }
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    const head = s.slice(0, 64);
    if (/^<!DOCTYPE html|^<html[\s>]/i.test(head)) {
      return `后端返回了 HTML 错误页（HTTP ${st ?? "?"}），多为 Vite 代理连不上 API。${apiHint}`;
    }
    try {
      const j = JSON.parse(s) as Record<string, unknown>;
      const m = j.message ?? j.msg ?? j.error;
      if (typeof m === "string" && m.trim()) return m;
    } catch {
      /* 非 JSON */
    }
    if (s.length && s.length < 400) return s;
  }

  if (st)
    return `请求失败（HTTP ${st}），无法解析为 JSON。${apiHint}`;
  return e?.message ?? "未知错误";
}
