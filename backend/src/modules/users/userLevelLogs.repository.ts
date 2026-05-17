/**
 * 会员等级变更日志（user_level_logs）
 */

import type { RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";

export interface UserLevelLogRow {
  id: number;
  user_id: number;
  from_level: string | null;
  to_level: string;
  changed_by: number;
  reason: string | null;
  created_at: Date;
}

export const userLevelLogsRepo = {
  async insert(input: {
    userId: number;
    fromLevel: string | null;
    toLevel: string;
    changedBy: number;
    reason?: string | null;
  }): Promise<void> {
    await pool.execute(
      `INSERT INTO user_level_logs (user_id, from_level, to_level, changed_by, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.fromLevel,
        input.toLevel,
        input.changedBy,
        input.reason ?? null,
      ],
    );
  },

  async listByUserId(userId: number, limit = 50): Promise<UserLevelLogRow[]> {
    const lim = Math.min(Math.max(limit, 1), 200);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, user_id, from_level, to_level, changed_by, reason, created_at
       FROM user_level_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
      [userId, lim],
    );
    return rows as UserLevelLogRow[];
  },
};
