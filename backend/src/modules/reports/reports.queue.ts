/**
 * 报告生成任务队列（BullMQ）
 * --------------------------------
 * - enqueueReport：路由提交后调用
 * - reportWorker：在 server.ts 启动时常驻运行；并发数受 env.QUEUE_CONCURRENCY 控制
 * - 优先级：pro/enterprise priority=1（高），其它 priority=10
 * - 失败重试：最多 2 次（含首次共 3 次），指数退避
 */

import { Queue, Worker, type Job } from "bullmq";
import { queueConnection } from "@/db/redis";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import type { MemberLevel } from "@/config/memberPlans";
import { getStorage } from "@/services/storage";
import { reportsRepo } from "@/modules/reports/reports.repository";
import { reportEngine } from "@/modules/reports/reports.engine";
import { reportPdf } from "@/modules/reports/reports.pdf";
import { reportDocx } from "@/modules/reports/reports.docx";
import { notificationsRepo } from "@/modules/notifications/notifications.repository";
import type { ReportFormat, ReportType } from "@/modules/reports/reports.types";

export interface ReportJobData {
  reportId: number;
  userId: number;
  userDisplayName: string;
  reportType: ReportType;
  timeRange: { start: string; end: string };
  zoneIds: number[] | null;
  formats: ReportFormat[];
}

export const REPORT_QUEUE_NAME = "report-generation";

let _queue: Queue<ReportJobData> | null = null;
let _worker: Worker<ReportJobData> | null = null;

export function getReportQueue(): Queue<ReportJobData> {
  if (_queue) return _queue;
  _queue = new Queue<ReportJobData>(REPORT_QUEUE_NAME, {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 7 * 86400, count: 1000 },
      removeOnFail:     { age: 14 * 86400, count: 1000 },
    },
  });
  return _queue;
}

const PRIORITY: Record<MemberLevel, number> = {
  free: 12,
  basic: 8,
  professional: 3,
  enterprise: 1,
};

export async function enqueueReport(data: ReportJobData, level: MemberLevel): Promise<void> {
  const q = getReportQueue();
  await q.add(`report-${data.reportId}`, data, {
    priority: PRIORITY[level] ?? 12,
    jobId: `report-${data.reportId}`,
  });
}

export function startReportWorker(): Worker<ReportJobData> {
  if (_worker) return _worker;
  _worker = new Worker<ReportJobData>(REPORT_QUEUE_NAME, processJob, {
    connection: queueConnection,
    concurrency: env.QUEUE_CONCURRENCY,
  });
  _worker.on("completed", (job) => logger.info({ jobId: job.id, reportId: job.data.reportId }, "📄 报告生成完成"));
  _worker.on("failed", (job, err) => logger.error({ err, jobId: job?.id, reportId: job?.data.reportId }, "❌ 报告生成失败"));
  _worker.on("ready", () => logger.info({ concurrency: env.QUEUE_CONCURRENCY }, "🛠️  报告 Worker 已启动"));
  return _worker;
}

export async function stopReportWorker(): Promise<void> {
  await Promise.allSettled([_worker?.close(), _queue?.close()]);
  _worker = null;
  _queue = null;
}

// =============================================================
// Worker 主流程
// =============================================================

async function processJob(job: Job<ReportJobData>): Promise<{ ok: true }> {
  const { reportId, userId, userDisplayName, reportType, timeRange, zoneIds, formats } = job.data;
  logger.info({ reportId, attempt: job.attemptsMade + 1 }, "▶️  开始生成报告");
  await reportsRepo.setStatus(reportId, "processing", null);

  try {
    // 1) 数据汇总 + AI 总结
    const reportRow = await reportsRepo.findById(reportId);
    if (!reportRow) throw new Error(`报告 ${reportId} 不存在`);
    const content = await reportEngine.buildContent({
      reportNo: reportRow.reportNo,
      reportType,
      timeRange,
      zoneIds,
      user: { id: userId, displayName: userDisplayName },
    });
    await reportsRepo.setContent(reportId, content, content.aiSummary);

    // 2) 渲染文件并存储
    const storage = getStorage();
    const filenameBase = `report-${reportRow.reportNo}`;

    const files: { pdf?: string | null; docx?: string | null } = {};
    if (formats.includes("pdf")) {
      const pdfBuf = await reportPdf.render(content);
      const out = await storage.putBuffer({
        dir: `reports/${userId}`,
        filename: `${filenameBase}.pdf`,
        contentType: "application/pdf",
        buffer: pdfBuf,
      });
      files.pdf = out.url;
    }
    if (formats.includes("docx")) {
      const docxBuf = await reportDocx.render(content);
      const out = await storage.putBuffer({
        dir: `reports/${userId}`,
        filename: `${filenameBase}.docx`,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: docxBuf,
      });
      files.docx = out.url;
    }
    await reportsRepo.setFiles(reportId, files);
    await reportsRepo.setStatus(reportId, "done", null);

    await notificationsRepo.create({
      userId,
      type: "report",
      title: `报告 ${reportRow.reportNo} 已生成`,
      content: `${reportType === "daily" ? "日" : reportType === "weekly" ? "周" : "最新"}检测报告（${formats.join("/")}）`,
      payload: { reportId, formats, fileUrlPdf: files.pdf ?? null, fileUrlDocx: files.docx ?? null },
    });
    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message ?? "unknown";
    logger.error({ err, reportId }, "报告生成出错");
    // 是否为最后一次尝试
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      await reportsRepo.setStatus(reportId, "failed", msg).catch(() => {});
      await notificationsRepo.create({
        userId,
        type: "report",
        title: `报告生成失败：${msg.slice(0, 80)}`,
        content: "请稍后重试或联系管理员",
        payload: { reportId },
      }).catch(() => {});
    }
    throw err;
  }
}
