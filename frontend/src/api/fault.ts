import { api } from "@/api/client";
import type {
  ApiResp,
  FaultImage,
  FaultListResp,
  FaultReport,
  FaultSeverity,
  FaultStatus,
} from "@/api/types";

export interface SubmitFaultDto {
  zoneId?: number | null;
  faultType: string;
  title: string;
  description: string;
  imageUrls: FaultImage[];
  severity?: FaultSeverity;
}

export async function uploadFaultImages(files: File[]): Promise<FaultImage[]> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  const r = await api.post<ApiResp<{ uploads: FaultImage[]; backend: "oss" | "local" }>>(
    "/fault-reports/uploads",
    fd,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return r.data.data.uploads;
}

export async function submitFaultReport(dto: SubmitFaultDto): Promise<FaultReport> {
  const r = await api.post<ApiResp<FaultReport>>("/fault-reports", dto);
  return r.data.data;
}

export interface ListFaultParams {
  status?: FaultStatus;
  severity?: FaultSeverity;
  zoneId?: number;
  keyword?: string;
  mine?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listFaultReports(params: ListFaultParams = {}): Promise<FaultListResp> {
  const r = await api.get<ApiResp<FaultListResp>>("/fault-reports", { params });
  return r.data.data;
}

export async function getFaultReport(id: number): Promise<FaultReport> {
  const r = await api.get<ApiResp<FaultReport>>(`/fault-reports/${id}`);
  return r.data.data;
}

export interface FaultPatchDto {
  status?: FaultStatus;
  severity?: FaultSeverity;
  handlerId?: number | null;
  handlerNote?: string | null;
}

export async function patchFaultReport(id: number, patch: FaultPatchDto): Promise<FaultReport> {
  const r = await api.patch<ApiResp<FaultReport>>(`/fault-reports/${id}`, patch);
  return r.data.data;
}

export async function reanalyzeFaultReport(id: number): Promise<FaultReport> {
  const r = await api.post<ApiResp<FaultReport>>(`/fault-reports/${id}/reanalyze`);
  return r.data.data;
}

export async function deleteFaultReport(id: number): Promise<void> {
  await api.delete(`/fault-reports/${id}`);
}

// =============================================================
// 视觉辅助
// =============================================================

export const SEVERITY_META: Record<FaultSeverity, { label: string; classes: string }> = {
  low:      { label: "一般",  classes: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" },
  medium:   { label: "中等",  classes: "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200" },
  high:     { label: "较重",  classes: "bg-orange-100 text-orange-700 ring-1 ring-orange-200" },
  critical: { label: "严重",  classes: "bg-rose-100 text-rose-700 ring-1 ring-rose-300" },
};

export const STATUS_META: Record<FaultStatus, { label: string; classes: string }> = {
  pending:    { label: "待处理", classes: "bg-slate-100 text-slate-600 ring-1 ring-slate-200" },
  processing: { label: "处理中", classes: "bg-sky-100 text-sky-700 ring-1 ring-sky-200" },
  closed:     { label: "已关闭", classes: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
};
