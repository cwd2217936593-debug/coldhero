/**
 * Express 应用工厂
 * --------------------------------
 * 拆分 app 与 server，便于将来做单测（注入 supertest）
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import "express-async-errors";

import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { apiRouter } from "@/routes";
import { errorHandler, notFoundHandler } from "@/middlewares/errorHandler";
import { getLocalStorageRootIfAny } from "@/services/storage";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", true);

  app.use(
    helmet({
      // 允许跨域加载本地上传图片
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/api/health" },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    }),
  );

  // 仅当对象存储为本地后备时挂静态目录
  const local = getLocalStorageRootIfAny();
  if (local) {
    app.use(local.prefix, express.static(local.root, { maxAge: "7d", fallthrough: true }));
  }

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
