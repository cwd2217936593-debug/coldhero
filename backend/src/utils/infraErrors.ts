/**
 * 将 mysql2 / ioredis / Node 网络错误转成可行动的 HTTP 响应（避免登录等业务只显示「500」）
 */

export interface MappedInfraError {
  status: number;
  code: string;
  message: string;
}

function collectErrorChain(err: unknown, out: unknown[], depth: number): void {
  if (err === null || err === undefined || depth > 6) return;
  out.push(err);
  if (typeof err !== "object") return;
  const o = err as Record<string, unknown>;
  const cause = o.cause;
  if (cause) collectErrorChain(cause, out, depth + 1);
  const errors = o.errors;
  if (Array.isArray(errors)) {
    for (const e of errors) collectErrorChain(e, out, depth + 1);
  }
}

function mapOneRecord(e: unknown): MappedInfraError | null {
  if (!e || typeof e !== "object") return null;
  const rec = e as Record<string, unknown>;
  const code = rec.code;

  if (code === "ECONNREFUSED") {
    const port = rec.port as number | undefined;
    const addr = String(rec.address ?? "127.0.0.1");
    if (port === 3306) {
      return {
        status: 503,
        code: "MYSQL_UNAVAILABLE",
        message:
          "无法连接 MySQL（端口 3306）。请先启动数据库：在项目根目录执行 `docker compose up -d mysql`，或在本机安装 MySQL 后导入 database/init 下 SQL。",
      };
    }
    if (port === 6379) {
      return {
        status: 503,
        code: "REDIS_UNAVAILABLE",
        message:
          "无法连接 Redis（端口 6379）。登录限流与配额依赖 Redis，请执行 `docker compose up -d redis` 或启动本机 Redis 后再试。",
      };
    }
    return {
      status: 503,
      code: "UPSTREAM_REFUSED",
      message: `无法连接依赖服务（${addr}:${port ?? "?"}）。请检查 MySQL / Redis 是否已启动。`,
    };
  }

  if (code === "ETIMEDOUT" || code === "PROTOCOL_CONNECTION_LOST") {
    return {
      status: 503,
      code: "DATABASE_UNAVAILABLE",
      message: "数据库连接中断或超时。请确认 MySQL 仍在线、网络稳定后重试。",
    };
  }

  if (typeof code === "string" && code.startsWith("ER_")) {
    const sqlMessage = typeof rec.sqlMessage === "string" ? rec.sqlMessage : "";
    if (code === "ER_NO_SUCH_TABLE") {
      return {
        status: 503,
        code,
        message:
          "数据库尚未初始化（缺少数据表）。请在 MySQL 中执行项目 database/init 目录下的 SQL 后再登录。",
      };
    }
    if (code === "ER_ACCESS_DENIED_ERROR") {
      return {
        status: 503,
        code,
        message: "MySQL 拒绝连接：请核对后端 .env 中的 MYSQL_USER / MYSQL_PASSWORD 是否与数据库一致。",
      };
    }
    if (code === "ER_BAD_DB_ERROR") {
      return {
        status: 503,
        code,
        message: "数据库 `coldhero` 不存在。请先创建库并执行 database/init 下初始化脚本。",
      };
    }
    return {
      status: 503,
      code,
      message: sqlMessage || "数据库执行失败，请查看后端日志。",
    };
  }

  return null;
}

function mapFromMessage(text: string): MappedInfraError | null {
  if (/ECONNREFUSED.*:3306\b|:3306.*ECONNREFUSED/.test(text)) {
    return {
      status: 503,
      code: "MYSQL_UNAVAILABLE",
      message:
        "无法连接 MySQL（端口 3306）。请先启动数据库：在项目根目录执行 `docker compose up -d mysql`，或在本机安装 MySQL 后导入 database/init 下 SQL。",
    };
  }
  if (/ECONNREFUSED.*:6379\b|:6379.*ECONNREFUSED/.test(text)) {
    return {
      status: 503,
      code: "REDIS_UNAVAILABLE",
      message:
        "无法连接 Redis（端口 6379）。登录限流依赖 Redis，请执行 `docker compose up -d redis` 或启动本机 Redis 后再试。",
    };
  }
  return null;
}

export function mapInfraError(err: unknown): MappedInfraError | null {
  const chain: unknown[] = [];
  collectErrorChain(err, chain, 0);

  for (const e of chain) {
    const m = mapOneRecord(e);
    if (m) return m;
  }

  for (const e of chain) {
    if (e instanceof Error && e.message) {
      const m = mapFromMessage(e.message);
      if (m) return m;
    }
  }

  return null;
}
