/**
 * Refresh Token 持久层（仅存 SHA-256(rawToken)，不回传明文）。
 * --------------------------------
 * rawToken 仅存客户端；泄露后可通过 revokeAllForUser / 单笔 revoke 兜底。
 */

import crypto from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";

function sha256Utf8(s: string): Buffer {
  return crypto.createHash("sha256").update(s, "utf8").digest();
}

interface ValidRow extends RowDataPacket {
  id: number;
  user_id: number;
}

export const refreshTokensRepo = {
  /**
   * 插入新会话 refresh；明文仅返回调用方写入响应体这一次。
   */
  async insert(userId: number, ttlMs: number): Promise<{ plainRefresh: string }> {
    const plainRefresh = crypto.randomBytes(48).toString("base64url");
    const tokenHash = sha256Utf8(plainRefresh);
    const expiresAt = new Date(Date.now() + ttlMs);
    await pool.execute<ResultSetHeader>(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [userId, tokenHash, expiresAt],
    );
    return { plainRefresh };
  },

  /** 校验 refresh 明文是否有效（未吊销、未过期） */
  async findValidUserIdByPlain(
    plainRefresh: string,
  ): Promise<{ id: number; userId: number } | null> {
    const tokenHash = sha256Utf8(plainRefresh);
    const [rows] = await pool.query<ValidRow[]>(
      `SELECT id, user_id AS user_id FROM refresh_tokens
       WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
      [tokenHash],
    );
    const r = rows[0];
    return r ? { id: r.id, userId: Number(r.user_id) } : null;
  },

  async revokeRowByPlain(plainRefresh: string): Promise<number> {
    const tokenHash = sha256Utf8(plainRefresh);
    const [r] = await pool.execute<ResultSetHeader>(
      `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
       WHERE token_hash = ? AND revoked_at IS NULL`,
      [tokenHash],
    );
    return r.affectedRows ?? 0;
  },

  async revokeAllForUser(userId: number): Promise<void> {
    await pool.execute<ResultSetHeader>(
      `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND revoked_at IS NULL`,
      [userId],
    );
  },
};
