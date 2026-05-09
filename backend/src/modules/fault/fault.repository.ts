/**
 * fault_reports DAO
 * --------------------------------
 * 仅做 SQL ↔ 行映射；列表 SQL 用 LEFT JOIN 一次取齐 zone / 提交人，省一次 IN 查询
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";
import type { FaultImage, FaultReport, FaultSeverity, FaultStatus } from "@/modules/fault/fault.types";

interface FaultRow extends RowDataPacket {
  id: number;
  user_id: number;
  zone_id: number | null;
  fault_type: string;
  title: string;
  description: string;
  image_urls: string | null; // JSON 字符串
  status: FaultStatus;
  severity: FaultSeverity;
  ai_analysis: string | null;
  handler_id: number | null;
  handler_note: string | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  zone_name?: string | null;
  zone_code?: string | null;
  reporter_name?: string | null;
}

const SELECT_FIELDS = `
  fr.id, fr.user_id, fr.zone_id, fr.fault_type, fr.title, fr.description,
  fr.image_urls, fr.status, fr.severity, fr.ai_analysis,
  fr.handler_id, fr.handler_note, fr.closed_at, fr.created_at, fr.updated_at,
  z.name AS zone_name, z.code AS zone_code,
  u.display_name AS reporter_name
`;

const FROM_JOIN = `
  FROM fault_reports fr
  LEFT JOIN zones z ON z.id = fr.zone_id
  LEFT JOIN users u ON u.id = fr.user_id
`;

function rowToReport(r: FaultRow): FaultReport {
  let images: FaultImage[] = [];
  if (r.image_urls) {
    try {
      const v = typeof r.image_urls === "string" ? JSON.parse(r.image_urls) : r.image_urls;
      if (Array.isArray(v)) images = v as FaultImage[];
    } catch {/* ignore malformed */}
  }
  return {
    id: r.id,
    userId: r.user_id,
    zoneId: r.zone_id,
    faultType: r.fault_type,
    title: r.title,
    description: r.description,
    imageUrls: images,
    status: r.status,
    severity: r.severity,
    aiAnalysis: r.ai_analysis,
    handlerId: r.handler_id,
    handlerNote: r.handler_note,
    closedAt: r.closed_at ? r.closed_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    zoneName: r.zone_name ?? null,
    zoneCode: r.zone_code ?? null,
    reporterName: r.reporter_name ?? null,
  };
}

export interface CreateFaultInput {
  userId: number;
  zoneId: number | null;
  faultType: string;
  title: string;
  description: string;
  imageUrls: FaultImage[];
  severity?: FaultSeverity;
}

export interface ListFaultFilter {
  userId?: number;          // 仅看本人（普通用户视图）
  status?: FaultStatus;
  severity?: FaultSeverity;
  zoneId?: number;
  keyword?: string;
  limit?: number;
  offset?: number;
}

export const faultRepo = {
  async create(input: CreateFaultInput): Promise<number> {
    const [r] = await pool.execute<ResultSetHeader>(
      `INSERT INTO fault_reports
       (user_id, zone_id, fault_type, title, description, image_urls, severity)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.zoneId,
        input.faultType,
        input.title,
        input.description,
        JSON.stringify(input.imageUrls ?? []),
        input.severity ?? "medium",
      ],
    );
    return r.insertId;
  },

  async setAiAnalysis(id: number, ai: string, severity?: FaultSeverity): Promise<void> {
    if (severity) {
      await pool.execute(
        "UPDATE fault_reports SET ai_analysis = ?, severity = ? WHERE id = ?",
        [ai, severity, id],
      );
    } else {
      await pool.execute("UPDATE fault_reports SET ai_analysis = ? WHERE id = ?", [ai, id]);
    }
  },

  async findById(id: number): Promise<FaultReport | null> {
    const [rows] = await pool.query<FaultRow[]>(
      `SELECT ${SELECT_FIELDS} ${FROM_JOIN} WHERE fr.id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? rowToReport(rows[0]) : null;
  },

  async list(filter: ListFaultFilter): Promise<{ items: FaultReport[]; total: number }> {
    const conds: string[] = [];
    const args: unknown[] = [];
    if (filter.userId !== undefined) { conds.push("fr.user_id = ?"); args.push(filter.userId); }
    if (filter.status)   { conds.push("fr.status = ?");   args.push(filter.status); }
    if (filter.severity) { conds.push("fr.severity = ?"); args.push(filter.severity); }
    if (filter.zoneId !== undefined) { conds.push("fr.zone_id = ?"); args.push(filter.zoneId); }
    if (filter.keyword) {
      conds.push("(fr.title LIKE ? OR fr.description LIKE ?)");
      const k = `%${filter.keyword}%`;
      args.push(k, k);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 200);
    const offset = Math.max(filter.offset ?? 0, 0);

    const [rows] = await pool.query<FaultRow[]>(
      `SELECT ${SELECT_FIELDS} ${FROM_JOIN} ${where}
       ORDER BY fr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    const [cnt] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM fault_reports fr ${where}`,
      args,
    );
    return { items: rows.map(rowToReport), total: Number((cnt[0] as { c: number }).c) };
  },

  async updateStatus(id: number, patch: {
    status?: FaultStatus;
    severity?: FaultSeverity;
    handlerId?: number | null;
    handlerNote?: string | null;
  }): Promise<void> {
    const fields: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    if (patch.status !== undefined)      { fields.push("status = ?");        values.push(patch.status); }
    if (patch.severity !== undefined)    { fields.push("severity = ?");      values.push(patch.severity); }
    if (patch.handlerId !== undefined)   { fields.push("handler_id = ?");    values.push(patch.handlerId); }
    if (patch.handlerNote !== undefined) { fields.push("handler_note = ?");  values.push(patch.handlerNote); }
    if (patch.status === "closed") fields.push("closed_at = CURRENT_TIMESTAMP");
    else if (patch.status !== undefined) fields.push("closed_at = NULL");
    if (!fields.length) return;
    values.push(id);
    await pool.execute(`UPDATE fault_reports SET ${fields.join(", ")} WHERE id = ?`, values);
  },

  async remove(id: number): Promise<void> {
    await pool.execute("DELETE FROM fault_reports WHERE id = ?", [id]);
  },
};
