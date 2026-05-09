/**
 * 全局错误处理 + 404 兜底
 */

import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "@/utils/errors";
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

  logger.error({ err, path: req.originalUrl }, "未处理异常");
  res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: "服务器内部错误",
  });
};
