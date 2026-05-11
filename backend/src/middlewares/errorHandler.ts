/**
 * 全局错误处理 + 404 兜底
 */

import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";
import { mapInfraError } from "@/utils/infraErrors";
import { logger } from "@/utils/logger";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    success: false,
    code: "NOT_FOUND",
    message: `路由不存在: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "参数校验失败",
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  const infra = mapInfraError(err);
  if (infra) {
    logger.warn({ err, path: req.originalUrl, infra }, "依赖服务错误");
    res.status(infra.status).json({
      success: false,
      code: infra.code,
      message: infra.message,
    });
    return;
  }

  logger.error({ err, path: req.originalUrl }, "未处理异常");

  const detail =
    env.APP_ENV === "development" && err instanceof Error && err.message
      ? err.message
      : "";
  res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: detail ? `服务器内部错误：${detail}` : "服务器内部错误",
  });
};
