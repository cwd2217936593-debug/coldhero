/**
 * 后端本地存储返回 `/uploads/...`；OSS 返回完整 https URL。
 * 开发态前端跑在另一端口时，相对路径会打到 Vite 而非 API（见 vite `/uploads` 代理）。
 * 前后端分离部署时可在构建环境变量里配置 `VITE_API_BASE_URL`（填写 API 源，勿含 `/api` 后缀）。
 */
export function publicAssetUrl(pathOrUrl: string | null | undefined): string {
  if (pathOrUrl == null) return "";
  const s = pathOrUrl.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const rawBase =
    import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  const base = rawBase.replace(/\/api$/i, "");
  if (base && s.startsWith("/")) return `${base}${s}`;
  return s;
}
