/**
 * user_quotas 表数据访问层
 * --------------------------------
 * Redis 是热数据，本表是兜底持久化（断电 / 缓存清空仍可恢复审计）。
 *
 * 写入策略：write-behind（异步），不阻塞主请求；失败仅记日志。
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";
import type { QuotaType } from "@/modules/quota/quota.types";

const COLUMN_BY_TYPE: Record<QuotaType, string> = {
  aiChat: "ai_chat_used",
  report: "report_used",
};

export const quotaRepo = {
  /**
   * UPSERT：若当日记录不存在则创建，否则把对应字段更新为 used 值
   * 注意：这里使用 ON DUPLICATE KEY UPDATE 配合 (user_id,date) 唯一索引
   */
  async upsertUsed(userId: number, date: string, type: QuotaType, used: number): Promise<void> {
    const col = COLUMN_BY_TYPE[type];
    await pool.execute<ResultSetHeader>(
      `INSERT INTO user_quotas (user_id, date, ${col})
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE ${col} = VALUES(${col})`,
      [userId, date, used],
    );
  },

  async getByUserDate(userId: number, date: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT user_id, date, ai_chat_used, report_used FROM user_quotas WHERE user_id = ? AND date = ?",
      [userId, date],
    );
    return rows[0] ?? null;
  },
};
