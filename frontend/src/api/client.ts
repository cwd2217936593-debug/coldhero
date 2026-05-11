import axios, { AxiosError } from "axios";
import { getTokenForChatGate } from "@/lib/deepseekBridge";
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

// 401 → 自动登出回登录页；429 弹升级提示
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<ApiResp<never>>) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clear();
    }
    return Promise.reject(err);
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
