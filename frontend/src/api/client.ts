import axios, { AxiosError } from "axios";
import { useAuthStore } from "@/store/authStore";
import type { ApiResp } from "@/api/types";

export const api = axios.create({
  baseURL: "/api",
  timeout: 30_000,
});

// 自动注入 JWT
api.interceptors.request.use((cfg) => {
  const token = useAuthStore.getState().token;
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

/** 抽出后端 message，找不到则使用 axios 默认信息 */
export function errMessage(err: unknown): string {
  const e = err as AxiosError<ApiResp<never>>;
  return e?.response?.data?.message ?? e?.message ?? "未知错误";
}
