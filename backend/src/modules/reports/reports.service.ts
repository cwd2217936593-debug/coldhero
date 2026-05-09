/**
 * 报告业务编排
 * --------------------------------
 * - submit：消耗 report 配额 → 落库 queued → 入队
 * - list / detail：限本人，admin 可看全部
 */

import { reportsRepo } from "@/modules/reports/reports.repository";
import { enqueueReport } from "@/modules/reports/reports.queue";
import { getPlan } from "@/config/memberPlans";
import { ForbiddenError, NotFoundError } from "@/utils/errors";
import { usersRepo } from "@/modules/users/users.repository";
import type { AuthUser } from "@/types/express";
import type {
  GeneratedReport,
  ReportFormat,
  ReportTimeRange,
  ReportType,
} from "@/modules/reports/reports.types";

export interface SubmitReportDto {
  reportType: ReportType;
  from?: string;
  to?: string;
  zoneIds?: number[] | null;
  formats: ReportFormat[];
}

function inferRange(type: ReportType): ReportTimeRange {
  const to = new Date();
  let span = 86400_000;
  if (type === "weekly") span = 7 * 86400_000;
  if (type === "latest") span = 24 * 3600_000;
  if (type === "daily") span = 24 * 3600_000;
  return { start: new Date(to.getTime() - span).toISOString(), end: to.toISOString() };
}

function genReportNo(userId: number, type: ReportType): string {
  const now = new Date();
  const wall = new Date(now.getTime() + 8 * 3600_000);
  const yyyy = wall.getUTCFullYear();
  const mm = String(wall.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(wall.getUTCDate()).padStart(2, "0");
  const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
  const t = type === "daily" ? "D" : type === "weekly" ? "W" : "L";
  return `RPT-${yyyy}${mm}${dd}-${t}-U${userId}-${rnd}`;
}

export const reportsService = {
  async submit(user: AuthUser, dto: SubmitReportDto): Promise<GeneratedReport> {
    const plan = getPlan(user.memberLevel);
    // docx 仅 basic+
    if (dto.formats.includes("docx") && !plan.allowDocxExport) {
      throw new ForbiddenError("当前会员等级不支持导出 Word 文件，请升级至基础版及以上");
    }

    // 配额已由路由层 requireQuota('report') 中间件原子消耗，service 层直接构造任务即可。

    const timeRange: ReportTimeRange = dto.from && dto.to
      ? { start: dto.from, end: dto.to }
      : inferRange(dto.reportType);

    const zoneIds = dto.zoneIds && dto.zoneIds.length ? dto.zoneIds : null;
    const reportNo = genReportNo(user.id, dto.reportType);
    const id = await reportsRepo.create({
      userId: user.id,
      reportNo,
      reportType: dto.reportType,
      timeRange,
      zoneIds,
    });

    // 入队（异步生成）
    const userRow = await usersRepo.findById(user.id);
    const displayName = userRow?.display_name ?? user.username;
    await enqueueReport({
      reportId: id,
      userId: user.id,
      userDisplayName: displayName,
      reportType: dto.reportType,
      timeRange,
      zoneIds,
      formats: dto.formats,
    }, user.memberLevel);

    return (await reportsRepo.findById(id))!;
  },

  async list(user: AuthUser, opts: {
    status?: GeneratedReport["status"];
    reportType?: ReportType;
    page: number;
    pageSize: number;
  }) {
    const isAdmin = user.role === "admin";
    const offset = (opts.page - 1) * opts.pageSize;
    const { items, total } = await reportsRepo.list({
      userId: isAdmin ? undefined : user.id,
      status: opts.status,
      reportType: opts.reportType,
      limit: opts.pageSize,
      offset,
    });
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  },

  async detail(user: AuthUser, id: number): Promise<GeneratedReport> {
    const r = await reportsRepo.findById(id);
    if (!r) throw new NotFoundError("报告不存在");
    if (user.role !== "admin" && r.userId !== user.id) throw new ForbiddenError("无权查看");
    return r;
  },

  async remove(user: AuthUser, id: number): Promise<void> {
    const r = await reportsRepo.findById(id);
    if (!r) throw new NotFoundError("报告不存在");
    if (user.role !== "admin" && r.userId !== user.id) throw new ForbiddenError("无权删除");
    await reportsRepo.remove(id, r.userId);
  },
};
