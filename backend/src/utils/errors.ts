/**
 * 统一业务异常
 * --------------------------------
 * - AppError：可控的业务错误，会被全局错误处理转成结构化 JSON
 * - 子类用于语义化标记常见场景（404/401/403/429）
 */

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, opts: { status?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = "AppError";
    this.status = opts.status ?? 500;
    this.code = opts.code ?? "INTERNAL_ERROR";
    this.details = opts.details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "请求参数无效", details?: unknown) {
    super(message, { status: 400, code: "BAD_REQUEST", details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "未登录或登录已过期") {
    super(message, { status: 401, code: "UNAUTHORIZED" });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "无权访问该资源") {
    super(message, { status: 403, code: "FORBIDDEN" });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "资源不存在") {
    super(message, { status: 404, code: "NOT_FOUND" });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "请求过多或当日配额已用完", details?: unknown) {
    super(message, { status: 429, code: "RATE_LIMITED", details });
  }
}

export class ConflictError extends AppError {
  constructor(message = "资源冲突", details?: unknown) {
    super(message, { status: 409, code: "CONFLICT", details });
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message: string, code = "UNPROCESSABLE_ENTITY", details?: unknown) {
    super(message, { status: 422, code, details });
  }
}
