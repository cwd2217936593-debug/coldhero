import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";
import type {
  GeneratedReport,
  ReportContent,
  ReportListFilter,
  ReportStatus,
  ReportTimeRange,
  ReportType,
} from "@/modules/reports/reports.types";

interface ReportRow extends RowDataPacket {
  id: number;
  user_id: number;
  report_no: string;
  report_type: ReportType;
  time_range: string | ReportTimeRange | null;
  zone_ids: string | number[] | null;
  summary: string | null;
  content_json: string | ReportContent | null;
  file_url_pdf: string | null;
  file_url_docx: string | null;
  status: ReportStatus;
  error_msg: string | null;
  created_at: Date;
  updated_at: Date;
}

function parseJsonField<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    try { return JSON.parse(v) as T; } catch { return null; }
  }
  return v as T;
}

function rowToReport(r: ReportRow): GeneratedReport {
  return {
    id: r.id,
    userId: r.user_id,
    reportNo: r.report_no,
    reportType: r.report_type,
    timeRange: parseJsonField<ReportTimeRange>(r.time_range) ?? { start: "", end: "" },
    zoneIds: parseJsonField<number[]>(r.zone_ids),
    summary: r.summary,
    contentJson: parseJsonField<ReportContent>(r.content_json),
    fileUrlPdf: r.file_url_pdf,
    fileUrlDocx: r.file_url_docx,
    status: r.status,
    errorMsg: r.error_msg,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface CreateReportInput {
  userId: number;
  reportNo: string;
  reportType: ReportType;
  timeRange: ReportTimeRange;
  zoneIds: number[] | null;
}

export const reportsRepo = {
  async create(input: CreateReportInput): Promise<number> {
    const [r] = await pool.execute<ResultSetHeader>(
      `INSERT INTO generated_reports
        (user_id, report_no, report_type, time_range, zone_ids, status)
       VALUES (?, ?, ?, ?, ?, 'queued')`,
      [
        input.userId,
        input.reportNo,
        input.reportType,
        JSON.stringify(input.timeRange),
        input.zoneIds ? JSON.stringify(input.zoneIds) : null,
      ],
    );
    return r.insertId;
  },

  async findById(id: number): Promise<GeneratedReport | null> {
    const [rows] = await pool.query<ReportRow[]>("SELECT * FROM generated_reports WHERE id = ? LIMIT 1", [id]);
    return rows[0] ? rowToReport(rows[0]) : null;
  },

  async list(filter: ReportListFilter): Promise<{ items: GeneratedReport[]; total: number }> {
    const conds: string[] = [];
    const args: (string | number)[] = [];
    if (filter.userId !== undefined) { conds.push("user_id = ?");      args.push(filter.userId); }
    if (filter.status)               { conds.push("status = ?");        args.push(filter.status); }
    if (filter.reportType)           { conds.push("report_type = ?");   args.push(filter.reportType); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 200);
    const offset = Math.max(filter.offset ?? 0, 0);
    const [rows] = await pool.query<ReportRow[]>(
      `SELECT * FROM generated_reports ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    const [cnt] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM generated_reports ${where}`,
      args,
    );
    return { items: rows.map(rowToReport), total: Number((cnt[0] as { c: number }).c) };
  },

  async setStatus(id: number, status: ReportStatus, errorMsg?: string | null): Promise<void> {
    if (errorMsg !== undefined) {
      await pool.execute(
        "UPDATE generated_reports SET status = ?, error_msg = ? WHERE id = ?",
        [status, errorMsg, id],
      );
    } else {
      await pool.execute("UPDATE generated_reports SET status = ? WHERE id = ?", [status, id]);
    }
  },

  async setContent(id: number, content: ReportContent, summary: string): Promise<void> {
    await pool.execute(
      "UPDATE generated_reports SET content_json = ?, summary = ? WHERE id = ?",
      [JSON.stringify(content), summary, id],
    );
  },

  async setFiles(id: number, files: { pdf?: string | null; docx?: string | null }): Promise<void> {
    const fields: string[] = [];
    const values: (string | null)[] = [];
    if (files.pdf !== undefined)  { fields.push("file_url_pdf = ?");  values.push(files.pdf); }
    if (files.docx !== undefined) { fields.push("file_url_docx = ?"); values.push(files.docx); }
    if (!fields.length) return;
    values.push(String(id));
    await pool.execute(`UPDATE generated_reports SET ${fields.join(", ")} WHERE id = ?`, values);
  },

  async remove(id: number, userId: number): Promise<void> {
    await pool.execute("DELETE FROM generated_reports WHERE id = ? AND user_id = ?", [id, userId]);
  },
};
