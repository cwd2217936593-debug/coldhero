/**
 * MySQL 连接池
 * --------------------------------
 * 使用 mysql2/promise，业务代码直接 await pool.query / pool.execute
 */

import mysql from "mysql2/promise";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

export const pool = mysql.createPool({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DATABASE,
  connectionLimit: env.MYSQL_CONNECTION_LIMIT,
  waitForConnections: true,
  queueLimit: 0,
  charset: "utf8mb4",
  timezone: "+08:00",
  dateStrings: false,
  supportBigNumbers: true,
  bigNumberStrings: false,
});

/** 启动期连通性检查 */
export async function pingMysql(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    logger.info({ host: env.MYSQL_HOST, db: env.MYSQL_DATABASE }, "✅ MySQL 连接成功");
  } finally {
    conn.release();
  }
}

/** 优雅关闭 */
export async function closeMysql(): Promise<void> {
  await pool.end();
}
