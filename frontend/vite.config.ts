import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import type { ServerResponse } from "node:http";

// 开发期：浏览器只访问同源 /api，由代理转发到 VITE_API_BASE_URL（默认 localhost:4000），避免混合 Mock 时直连后端触发 CORS
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname), "");
  const apiTarget = (env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
  const wsTarget = apiTarget.replace(/^http/i, "ws");

  const proxyApiConfigure: NonNullable<ProxyOptions["configure"]> = (proxy) => {
    proxy.on("error", (err, _req, res) => {
      if (!res || typeof (res as ServerResponse).writeHead !== "function") return;
      const sr = res as ServerResponse;
      if (sr.headersSent) return;
      const code = (err as NodeJS.ErrnoException).code ?? "";
      const detail = code || (err as Error).message;
      try {
        sr.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
        sr.end(
          JSON.stringify({
            success: false,
            code: "PROXY_UPSTREAM_UNAVAILABLE",
            message: `开发代理连不上 ${apiTarget}（${detail}）。请在 backend 目录执行 npm run dev，并在项目根执行 docker compose up -d mysql redis（或本机启动 MySQL/Redis）。`,
          }),
        );
      } catch {
        /* ignore */
      }
    });
  };

  return {
    plugins: [react()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "src") },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          configure: proxyApiConfigure,
        },
        "/uploads": {
          target: apiTarget,
          changeOrigin: true,
          configure: proxyApiConfigure,
        },
        "/ws": {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
