/**
 * 历史曲线业务（自动选桶）
 * --------------------------------
 * 按时间跨度自动选择聚合粒度，避免大窗口返回几十万原始点拖垮前端：
 *   - 跨度 ≤ 4h        : 原始点（不聚合）
 *   - 跨度 ≤ 2 天      : 5 分钟桶
 *   - 跨度 ≤ 14 天     : 1 小时桶
 *   - 跨度 > 14 天     : 1 天桶
 *
 * 调用方可显式 override（bucketSec），但不推荐。
 */

import {
  sensorsRepo,
  toPublicSensor,
  type AggregatedPoint,
  type PublicSensor,
} from "@/modules/sensors/sensors.repository";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export type Bucket = "raw" | "5min" | "1h" | "1d";

const BUCKET_SEC: Record<Bucket, number> = {
  raw: 0,
  "5min": 300,
  "1h": 3600,
  "1d": 86400,
};

export function pickBucket(fromAt: Date, toAt: Date): Bucket {
  const span = toAt.getTime() - fromAt.getTime();
  if (span <= 4 * HOUR) return "raw";
  if (span <= 2 * DAY) return "5min";
  if (span <= 14 * DAY) return "1h";
  return "1d";
}

export interface HistoryResult {
  bucket: Bucket;
  bucketSec: number;
  pointCount: number;
  /** 原始点（仅 bucket=raw 时使用） */
  raw?: PublicSensor[];
  /** 聚合点（bucket≠raw） */
  aggregated?: AggregatedPoint[];
}

export const historyService = {
  async query(zoneId: number, fromAt: Date, toAt: Date, override?: Bucket): Promise<HistoryResult> {
    const bucket = override ?? pickBucket(fromAt, toAt);
    const bucketSec = BUCKET_SEC[bucket];
    if (bucketSec === 0) {
      const rows = await sensorsRepo.seriesByZone(zoneId, fromAt, toAt, 10000);
      return {
        bucket,
        bucketSec,
        pointCount: rows.length,
        raw: rows.map(toPublicSensor),
      };
    }
    const aggregated = await sensorsRepo.aggregateByZone(zoneId, fromAt, toAt, bucketSec, 10000);
    return {
      bucket,
      bucketSec,
      pointCount: aggregated.length,
      aggregated,
    };
  },
};
