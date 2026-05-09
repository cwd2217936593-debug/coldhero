/**
 * 模型预测服务
 * --------------------------------
 * 数据来源（按优先级）：
 *  1. PYTHON_FORECAST_URL 配置存在 → POST 调远程微服务
 *  2. 否则读取 FORECAST_CSV_DIR/{zone_code}.csv（兜底）
 *
 * CSV 列约定：timestamp,temperature_predicted[,humidity_predicted,co2_predicted]
 *  - timestamp 支持 ISO8601 或 'YYYY-MM-DD HH:mm:ss'（按 UTC+8 解析）
 *  - 缺失列允许为空字符串
 *
 * 指标计算：
 *  - 实际数据从 sensor_history 加载（与预测点按时间最近邻匹配，容差默认 ±60s）
 *  - 输出 RMSE / MAE / MAPE（MAPE 跳过 |actual| < 0.01 防爆）
 */

import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { sensorsRepo, type SensorRow } from "@/modules/sensors/sensors.repository";
import { zonesRepo, type ZoneRow } from "@/modules/zones/zones.repository";
import { NotFoundError } from "@/utils/errors";

export interface ForecastPoint {
  timestamp: Date;
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
}

export interface ForecastResult {
  zoneId: number;
  zoneCode: string;
  source: "csv" | "python";
  from: Date;
  to: Date;
  points: ForecastPoint[];
}

export interface FitMetrics {
  rmse: number | null;
  mae: number | null;
  mape: number | null;
  pairCount: number;
}

export interface CompareResult {
  zoneId: number;
  zoneCode: string;
  from: Date;
  to: Date;
  actual: { timestamp: Date; temperature: number | null }[];
  predicted: { timestamp: Date; temperature: number | null }[];
  metrics: FitMetrics;
  source: "csv" | "python";
}

const MATCH_TOLERANCE_MS = 60 * 1000;

export const forecastService = {
  async load(zoneId: number, fromAt: Date, toAt: Date): Promise<ForecastResult> {
    const zone = await zonesRepo.findById(zoneId);
    if (!zone) throw new NotFoundError("库区不存在");

    if (env.PYTHON_FORECAST_URL) {
      const points = await callPythonForecast(zone, fromAt, toAt);
      return { zoneId: zone.id, zoneCode: zone.code, source: "python", from: fromAt, to: toAt, points };
    }
    const points = await loadFromCsv(zone, fromAt, toAt);
    return { zoneId: zone.id, zoneCode: zone.code, source: "csv", from: fromAt, to: toAt, points };
  },

  async compare(zoneId: number, fromAt: Date, toAt: Date): Promise<CompareResult> {
    const [forecast, actualRows] = await Promise.all([
      this.load(zoneId, fromAt, toAt),
      sensorsRepo.seriesByZone(zoneId, fromAt, toAt, 10000),
    ]);

    const metrics = computeMetrics(
      actualRows.map((r) => ({ ts: r.recorded_at, val: numericOrNull(r.temperature) })),
      forecast.points.map((p) => ({ ts: p.timestamp, val: p.temperature })),
    );

    return {
      zoneId: forecast.zoneId,
      zoneCode: forecast.zoneCode,
      from: fromAt,
      to: toAt,
      actual: actualRows.map((r: SensorRow) => ({
        timestamp: r.recorded_at,
        temperature: numericOrNull(r.temperature),
      })),
      predicted: forecast.points.map((p) => ({
        timestamp: p.timestamp,
        temperature: p.temperature,
      })),
      metrics,
      source: forecast.source,
    };
  },
};

// =============================================================
// CSV 兜底
// =============================================================

async function loadFromCsv(zone: ZoneRow, fromAt: Date, toAt: Date): Promise<ForecastPoint[]> {
  const file = path.join(env.FORECAST_CSV_DIR, `${zone.code}.csv`);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      logger.warn({ file }, "预测 CSV 文件不存在；返回空预测");
      return [];
    }
    throw err;
  }

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const header = lines.shift()!.split(",").map((s) => s.trim().toLowerCase());
  const idx = {
    ts: header.indexOf("timestamp"),
    t: header.indexOf("temperature_predicted"),
    h: header.indexOf("humidity_predicted"),
    c: header.indexOf("co2_predicted"),
  };
  if (idx.ts < 0 || idx.t < 0) {
    throw new Error(`CSV 缺少必要列 (timestamp, temperature_predicted): ${file}`);
  }

  const out: ForecastPoint[] = [];
  for (const line of lines) {
    const cols = line.split(",");
    const ts = parseTimestamp(cols[idx.ts]?.trim() ?? "");
    if (!ts || ts < fromAt || ts > toAt) continue;
    out.push({
      timestamp: ts,
      temperature: parseNum(cols[idx.t]),
      humidity: idx.h >= 0 ? parseNum(cols[idx.h]) : null,
      co2: idx.c >= 0 ? parseNum(cols[idx.c]) : null,
    });
  }
  out.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return out;
}

function parseTimestamp(s: string): Date | null {
  if (!s) return null;
  // 支持 'YYYY-MM-DD HH:mm:ss' 及 ISO8601；前者按 UTC+8 解析
  const space = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s);
  if (space && !s.includes("T")) {
    return new Date(s.replace(" ", "T") + "+08:00");
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseNum(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// =============================================================
// Python 微服务
// =============================================================

async function callPythonForecast(
  zone: ZoneRow,
  fromAt: Date,
  toAt: Date,
): Promise<ForecastPoint[]> {
  const res = await fetch(env.PYTHON_FORECAST_URL.replace(/\/$/, "") + "/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      zoneCode: zone.code,
      from: fromAt.toISOString(),
      to: toAt.toISOString(),
      intervalSec: 300,
    }),
    signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Python forecast 服务返回 ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { points: { timestamp: string; temperature?: number; humidity?: number; co2?: number }[] };
  return json.points.map((p) => ({
    timestamp: new Date(p.timestamp),
    temperature: p.temperature ?? null,
    humidity: p.humidity ?? null,
    co2: p.co2 ?? null,
  }));
}

// =============================================================
// 指标计算
// =============================================================

interface Pair {
  ts: Date;
  val: number | null;
}

function computeMetrics(actual: Pair[], predicted: Pair[]): FitMetrics {
  if (!actual.length || !predicted.length) {
    return { rmse: null, mae: null, mape: null, pairCount: 0 };
  }
  // 按时间排序后用双指针做最近邻匹配
  const a = actual.filter((p) => p.val !== null).sort((x, y) => x.ts.getTime() - y.ts.getTime());
  const p = predicted.filter((q) => q.val !== null).sort((x, y) => x.ts.getTime() - y.ts.getTime());
  let i = 0;
  let j = 0;
  let sumSq = 0;
  let sumAbs = 0;
  let sumPct = 0;
  let pctCount = 0;
  let pairs = 0;

  while (i < a.length && j < p.length) {
    const ai = a[i];
    const pj = p[j];
    const dt = ai.ts.getTime() - pj.ts.getTime();
    if (Math.abs(dt) <= MATCH_TOLERANCE_MS) {
      const diff = (ai.val as number) - (pj.val as number);
      sumSq += diff * diff;
      sumAbs += Math.abs(diff);
      if (Math.abs(ai.val as number) >= 0.01) {
        sumPct += Math.abs(diff / (ai.val as number));
        pctCount++;
      }
      pairs++;
      i++;
      j++;
    } else if (dt < 0) {
      i++;
    } else {
      j++;
    }
  }
  if (!pairs) return { rmse: null, mae: null, mape: null, pairCount: 0 };
  return {
    rmse: Number(Math.sqrt(sumSq / pairs).toFixed(4)),
    mae: Number((sumAbs / pairs).toFixed(4)),
    mape: pctCount ? Number(((sumPct / pctCount) * 100).toFixed(4)) : null,
    pairCount: pairs,
  };
}

function numericOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
