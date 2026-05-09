import { z } from "zod";

const REPORT_TYPES = ["daily", "weekly", "latest"] as const;
const FORMATS = ["pdf", "docx"] as const;

export const createReportSchema = z.object({
  reportType: z.enum(REPORT_TYPES),
  /** 可选：未传则按 reportType 自动推算（daily=最近 1d，weekly=7d，latest=24h） */
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  zoneIds: z.array(z.coerce.number().int().positive()).max(20).nullable().optional(),
  formats: z.array(z.enum(FORMATS)).min(1).max(2).default(["pdf"]),
});

export const listReportsQuery = z.object({
  status: z.enum(["queued", "processing", "done", "failed"]).optional(),
  reportType: z.enum(REPORT_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
