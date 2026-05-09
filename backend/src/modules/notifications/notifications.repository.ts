/**
 * 站内消息通知 DAO
 * --------------------------------
 * user_id = 0 表示广播给所有用户（前端列表查询时 OR 取出）
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";

export interface NotificationRow {
  id: number;
  user_id: number;
  type: string;
  title: string;
  content: string | null;
  payload: unknown;
  is_read: number;
  created_at: Date;
}

export interface CreateNotificationInput {
  /** 0 表示广播 */
  userId: number;
  type: "alert" | "fault" | "system" | "report";
  title: string;
  content?: string;
  payload?: Record<string, unknown>;
}

export const notificationsRepo = {
  async create(input: CreateNotificationInput): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO notifications (user_id, type, title, content, payload)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.type,
        input.title,
        input.content ?? null,
        input.payload ? JSON.stringify(input.payload) : null,
      ],
    );
    return result.insertId;
  },

  async listForUser(
    userId: number,
    opts: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
  ): Promise<NotificationRow[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const where = ["(user_id = ? OR user_id = 0)"];
    const params: unknown[] = [userId];
    if (opts.unreadOnly) where.push("is_read = 0");
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM notifications WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return rows as NotificationRow[];
  },

  async countUnread(userId: number): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM notifications
       WHERE (user_id = ? OR user_id = 0) AND is_read = 0`,
      [userId],
    );
    return Number((rows[0] as { c: number }).c);
  },

  async markRead(userId: number, ids: number[]): Promise<void> {
    if (!ids.length) return;
    await pool.query(
      "UPDATE notifications SET is_read = 1 WHERE (user_id = ? OR user_id = 0) AND id IN (?)",
      [userId, ids],
    );
  },

  async markAllRead(userId: number): Promise<void> {
    await pool.execute(
      "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
      [userId],
    );
  },
};

export function toPublicNotification(row: NotificationRow) {
  let payload: unknown = row.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      /* keep raw */
    }
  }
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    content: row.content,
    payload,
    isRead: row.is_read === 1,
    createdAt: row.created_at,
  };
}
