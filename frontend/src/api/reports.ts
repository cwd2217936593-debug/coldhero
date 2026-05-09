import { api } from "@/api/client";
import type {
  ApiResp,
  GeneratedReport,
  ReportFormat,
  ReportListResp,
  ReportStatus,
  ReportType,
} from "@/api/types";

export interface SubmitReportDto {
  reportType: ReportType;
  from?: string;
  to?: string;
  zoneIds?: number[] | null;
  formats: ReportFormat[];
}

export async function submitReport(dto: SubmitReportDto): Promise<GeneratedReport> {
  const r = await api.post<ApiResp<GeneratedReport>>("/reports", dto);
  return r.data.data;
}

export interface ListReportsParams {
  status?: ReportStatus;
  reportType?: ReportType;
  page?: number;
  pageSize?: number;
}
export async function listReports(params: ListReportsParams = {}): Promise<ReportListResp> {
  const r = await api.get<ApiResp<ReportListResp>>("/reports", { params });
  return r.data.data;
}
export async function getReport(id: number): Promise<GeneratedReport> {
  const r = await api.get<ApiResp<GeneratedReport>>(`/reports/${id}`);
  return r.data.data;
}
export async function deleteReport(id: number): Promise<void> {
  await api.delete(`/reports/${id}`);
}

export const STATUS_META: Record<ReportStatus, { label: string; classes: string; icon: string }> = {
  queued:     { label: "排队中",  classes: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",   icon: "⏳" },
  processing: { label: "生成中",  classes: "bg-sky-100 text-sky-700 ring-1 ring-sky-200",          icon: "🛠️" },
  done:       { label: "已完成",  classes: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200", icon: "✅" },
  failed:     { label: "失败",    classes: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",        icon: "❌" },
};
export const TYPE_LABEL: Record<ReportType, string> = {
  daily: "日检测报告",
  weekly: "周检测报告",
  latest: "最新检测报告",
};
