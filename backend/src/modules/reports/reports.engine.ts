/**
 * 报告内容生成引擎
 * --------------------------------
 * 拉取范围内的数据 → 计算统计量 → 让 AI 给出总结/建议 → 返回 ReportContent
 */

import { sensorsRepo } from "@/modules/sensors/sensors.repository";
import { zonesRepo } from "@/modules/zones/zones.repository";
import { faultRepo } from "@/modules/fault/fault.repository";
import { aiClient } from "@/services/aiClient";
import { logger } from "@/utils/logger";
import type {
  ReportContent,
  ReportTimeRange,
  ReportType,
  ZoneReport,
} from "@/modules/reports/reports.types";

export interface BuildContentOpts {
  reportNo: string;
  reportType: ReportType;
  timeRange: ReportTimeRange;
  zoneIds: number[] | null; // null = 全部库区
  user: { id: number; displayName: string };
}

export const reportEngine = {
  async buildContent(opts: BuildContentOpts): Promise<ReportContent> {
    const fromAt = new Date(opts.timeRange.start);
    const toAt = new Date(opts.timeRange.end);

    // 1) 库区列表
    const allZones = await zonesRepo.list();
    const zones = opts.zoneIds && opts.zoneIds.length
      ? allZones.filter((z) => opts.zoneIds!.includes(z.id))
      : allZones;

    // 2) 每个库区分析
    const zoneReports: ZoneReport[] = [];
    let totalSamples = 0;
    let totalAnomalies = 0;
    for (const z of zones) {
      const series = await sensorsRepo.seriesByZone(z.id, fromAt, toAt, 50000);
      const temps = series.map((s) => s.temperature).filter((v): v is number => typeof v === "number");
      const anomalyCount = series.filter((s) => s.is_anomaly === 1).length;
      const sampleCount = series.length;
      totalSamples += sampleCount;
      totalAnomalies += anomalyCount;

      const minTemp = temps.length ? Math.min(...temps) : null;
      const maxTemp = temps.length ? Math.max(...temps) : null;
      const avgTemp = temps.length ? round(temps.reduce((a, b) => a + b, 0) / temps.length, 2) : null;
      const overLimitMinutes = roundMinutes(estimateOverLimitMs(series, Number(z.temp_min), Number(z.temp_max)));

      // 每日聚合（到天）
      const dailyMap = new Map<string, { sum: number; n: number; min: number; max: number; anomaly: number }>();
      for (const s of series) {
        const d = toDateKey(s.recorded_at);
        const e = dailyMap.get(d) ?? { sum: 0, n: 0, min: Infinity, max: -Infinity, anomaly: 0 };
        if (typeof s.temperature === "number") {
          e.sum += s.temperature; e.n += 1;
          if (s.temperature < e.min) e.min = s.temperature;
          if (s.temperature > e.max) e.max = s.temperature;
        }
        if (s.is_anomaly === 1) e.anomaly += 1;
        dailyMap.set(d, e);
      }
      const dailySeries = [...dailyMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, e]) => ({
          date,
          avg: e.n ? round(e.sum / e.n, 2) : null,
          min: e.n ? round(e.min, 2) : null,
          max: e.n ? round(e.max, 2) : null,
          anomaly: e.anomaly,
        }));

      // 同期故障
      const { items: faults } = await faultRepo.list({ zoneId: z.id, limit: 50 });
      const faultsInRange = faults
        .filter((f) => {
          const t = new Date(f.createdAt).getTime();
          return t >= fromAt.getTime() && t <= toAt.getTime();
        })
        .map((f) => ({ id: f.id, title: f.title, severity: f.severity, status: f.status, createdAt: f.createdAt }));

      zoneReports.push({
        zone: {
          id: z.id, code: z.code, name: z.name,
          tempMin: Number(z.temp_min), tempMax: Number(z.temp_max),
        },
        stats: {
          sampleCount, minTemp, maxTemp, avgTemp,
          anomalyCount,
          anomalyRate: sampleCount ? round((anomalyCount / sampleCount) * 100, 2) : 0,
          overLimitMinutes,
        },
        dailySeries,
        faults: faultsInRange,
      });
    }

    // 3) AI 总结（对整体）
    const overall = {
      totalSamples,
      totalAnomalies,
      anomalyRate: totalSamples ? round((totalAnomalies / totalSamples) * 100, 2) : 0,
    };
    const { aiSummary, recommendations } = await summarizeWithAi({
      reportType: opts.reportType,
      timeRange: opts.timeRange,
      zones: zoneReports,
      overall,
    });

    return {
      meta: {
        reportNo: opts.reportNo,
        reportType: opts.reportType,
        timeRange: opts.timeRange,
        generatedAt: new Date().toISOString(),
        user: opts.user,
      },
      zones: zoneReports,
      aiSummary,
      recommendations,
      overall,
    };
  },
};

// =============================================================
// 工具
// =============================================================

function round(v: number, d: number) { return Number(v.toFixed(d)); }

function toDateKey(d: Date): string {
  // UTC+8 日期键
  const wall = new Date(d.getTime() + 8 * 3600_000);
  return `${wall.getUTCFullYear()}-${String(wall.getUTCMonth() + 1).padStart(2, "0")}-${String(wall.getUTCDate()).padStart(2, "0")}`;
}

/** 粗估超限时长：相邻两点平均温度若同时越界，把两点间隔的一半计入。 */
function estimateOverLimitMs(rows: { temperature: number | null; recorded_at: Date }[], lo: number, hi: number): number {
  let ms = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    const dt = b.recorded_at.getTime() - a.recorded_at.getTime();
    if (dt <= 0 || dt > 30 * 60_000) continue; // 超过 30 分钟视为间断
    const aOver = a.temperature !== null && (a.temperature < lo || a.temperature > hi);
    const bOver = b.temperature !== null && (b.temperature < lo || b.temperature > hi);
    if (aOver && bOver) ms += dt;
    else if (aOver || bOver) ms += dt / 2;
  }
  return ms;
}
function roundMinutes(ms: number) { return Math.round(ms / 60_000); }

// =============================================================
// AI 总结
// =============================================================

const AI_SYSTEM = `你是一名冷库管理与质量分析专家，正在为客户撰写"AI 检测报告"。
- 输出 **严格 JSON**，键固定：summary（不超过 300 字 markdown）、recommendations（字符串数组，3~6 条）。
- summary 应覆盖：报告期、整体合规情况、主要异常库区、关联故障线索。
- recommendations 应给出 **可立即执行的运维动作**，避免空话。
- 不要使用 markdown 代码块包裹 JSON，直接输出 JSON 对象。`;

interface AiSummaryInput {
  reportType: ReportType;
  timeRange: ReportTimeRange;
  zones: ZoneReport[];
  overall: { totalSamples: number; totalAnomalies: number; anomalyRate: number };
}

async function summarizeWithAi(input: AiSummaryInput): Promise<{ aiSummary: string; recommendations: string[] }> {
  const userMsg = JSON.stringify({
    reportType: input.reportType,
    timeRange: input.timeRange,
    overall: input.overall,
    zones: input.zones.map((z) => ({
      code: z.zone.code,
      name: z.zone.name,
      tempLimits: [z.zone.tempMin, z.zone.tempMax],
      stats: z.stats,
      faultCount: z.faults.length,
      criticalFaultCount: z.faults.filter((f) => f.severity === "critical").length,
    })),
  });

  try {
    const r = await aiClient.chat([
      { role: "system", content: AI_SYSTEM },
      { role: "user", content: `请基于以下数据撰写报告 JSON：\n${userMsg}` },
    ], "fast");

    const cleaned = r.content.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const obj = JSON.parse(cleaned);
    const aiSummary = typeof obj.summary === "string" ? obj.summary : "（AI 未返回 summary）";
    const recommendations = Array.isArray(obj.recommendations) ? obj.recommendations.map(String) : [];
    return { aiSummary, recommendations };
  } catch (err) {
    logger.error({ err }, "AI 报告总结失败，使用兜底总结");
    return { aiSummary: buildFallbackSummary(input), recommendations: buildFallbackRecommendations(input) };
  }
}

function buildFallbackSummary(input: AiSummaryInput): string {
  const lines: string[] = [];
  lines.push(`本报告期共采集 **${input.overall.totalSamples}** 个传感器样本，其中异常点 **${input.overall.totalAnomalies}** 个（占比 ${input.overall.anomalyRate}%）。`);
  for (const z of input.zones) {
    lines.push(`- 库区 ${z.zone.code}（${z.zone.name}）：均温 ${z.stats.avgTemp}℃，超限累计 ${z.stats.overLimitMinutes} 分钟，关联故障 ${z.faults.length} 起。`);
  }
  return lines.join("\n");
}
function buildFallbackRecommendations(input: AiSummaryInput): string[] {
  const recs: string[] = [];
  for (const z of input.zones) {
    if (z.stats.anomalyRate > 5) recs.push(`重点关注 ${z.zone.code}：异常率 ${z.stats.anomalyRate}%，建议核查制冷机组与传感器校准。`);
    if (z.stats.overLimitMinutes > 30) recs.push(`${z.zone.code} 累计超限 ${z.stats.overLimitMinutes} 分钟，建议复核库门密封与化霜节奏。`);
  }
  if (!recs.length) recs.push("整体运行平稳，建议保持现有运维节奏并持续观察。");
  return recs;
}
