/**
 * AI 问答日志 DAO
 * --------------------------------
 * 一条记录 = 一次 Q+A
 * status 流转：pending → success | failed
 *
 * 该表也是「高频问题归因」（阶段 10）的源数据，需保留全量。
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";

export type ChatStatus = "pending" | "success" | "failed";

export interface ChatLogRow {
  id: number;
  user_id: number;
  session_id: string;
  question: string;
  answer: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  model: string | null;
  status: ChatStatus;
  error_msg: string | null;
  created_at: Date;
}

export interface SessionSummaryRow {
  session_id: string;
  message_count: number;
  last_message_at: Date;
  first_question: string;
}

export const chatRepo = {
  async insertPending(input: {
    userId: number;
    sessionId: string;
    question: string;
  }): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ai_chat_logs (user_id, session_id, question, status)
       VALUES (?, ?, ?, 'pending')`,
      [input.userId, input.sessionId, input.question],
    );
    return result.insertId;
  },

  async fillAnswer(
    id: number,
    args: {
      answer: string;
      model: string;
      tokensIn?: number | null;
      tokensOut?: number | null;
      latencyMs?: number | null;
    },
  ): Promise<void> {
    await pool.execute(
      `UPDATE ai_chat_logs
        SET answer = ?, model = ?, tokens_in = ?, tokens_out = ?, latency_ms = ?, status = 'success'
        WHERE id = ?`,
      [
        args.answer,
        args.model,
        args.tokensIn ?? null,
        args.tokensOut ?? null,
        args.latencyMs ?? null,
        id,
      ],
    );
  },

  async markFailed(id: number, errorMsg: string): Promise<void> {
    await pool.execute(
      "UPDATE ai_chat_logs SET status = 'failed', error_msg = ? WHERE id = ?",
      [errorMsg.slice(0, 500), id],
    );
  },

  /** 取某会话最近 N 条已完成的 Q+A 用于上下文拼接（按时间升序返回） */
  async loadRecentMessages(
    userId: number,
    sessionId: string,
    limit = 10,
  ): Promise<ChatLogRow[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM (
         SELECT * FROM ai_chat_logs
         WHERE user_id = ? AND session_id = ? AND status = 'success'
         ORDER BY created_at DESC LIMIT ?
       ) t ORDER BY created_at ASC`,
      [userId, sessionId, limit],
    );
    return rows as ChatLogRow[];
  },

  /** 列出该用户的会话（按最后一次提问时间降序） */
  async listSessions(userId: number, limit = 50): Promise<SessionSummaryRow[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT session_id,
              COUNT(*)          AS message_count,
              MAX(created_at)   AS last_message_at,
              SUBSTRING_INDEX(GROUP_CONCAT(question ORDER BY created_at ASC SEPARATOR '\\u0001'), '\\u0001', 1) AS first_question
       FROM ai_chat_logs
       WHERE user_id = ?
       GROUP BY session_id
       ORDER BY last_message_at DESC
       LIMIT ?`,
      [userId, limit],
    );
    return rows as SessionSummaryRow[];
  },

  /** 完整会话记录（含 pending、failed） */
  async listMessages(
    userId: number,
    sessionId: string,
    limit = 200,
  ): Promise<ChatLogRow[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM ai_chat_logs
       WHERE user_id = ? AND session_id = ?
       ORDER BY created_at ASC LIMIT ?`,
      [userId, sessionId, limit],
    );
    return rows as ChatLogRow[];
  },
};

export function toPublicChatLog(row: ChatLogRow) {
  return {
    id: row.id,
    sessionId: row.session_id,
    question: row.question,
    answer: row.answer,
    model: row.model,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    latencyMs: row.latency_ms,
    status: row.status,
    errorMsg: row.error_msg,
    createdAt: row.created_at,
  };
}

export function toPublicSession(row: SessionSummaryRow) {
  return {
    sessionId: row.session_id,
    messageCount: Number(row.message_count),
    lastMessageAt: row.last_message_at,
    firstQuestion: row.first_question,
  };
}
