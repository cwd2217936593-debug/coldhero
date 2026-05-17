/**
 * 将快照中的最新点对齐进折线序列（去重 ID / recordedAt）。
 */
import type { SensorPoint } from "@/api/types";

export function mergeLatestPointIntoSeries(
  prev: SensorPoint[],
  latest: SensorPoint | null | undefined,
  maxPoints = 720,
): SensorPoint[] {
  if (!latest) return prev;
  const last = prev[prev.length - 1];
  if (last?.id === latest.id) return prev;
  if (last?.recordedAt === latest.recordedAt) return prev;
  const next = [...prev, latest];
  if (next.length > maxPoints) next.splice(0, next.length - maxPoints);
  return next;
}
