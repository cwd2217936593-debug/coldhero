/**
 * 传感器业务服务
 * --------------------------------
 * - ingest：写入数据 + 与库区阈值比对 + 发布事件 + 异常持久化告警
 * - 异常告警去抖：同一库区 3 分钟内同种异常不重复发通知（避免刷屏）
 * - 实时事件总是发出（前端图表实时刷新需要全部点）
 */

import { redis } from "@/db/redis";
import { logger } from "@/utils/logger";
import {
  sensorsRepo,
  toPublicSensor,
  type SensorInsertInput,
  type PublicSensor,
} from "@/modules/sensors/sensors.repository";
import { zonesRepo, type ZoneRow } from "@/modules/zones/zones.repository";
import { notificationsRepo } from "@/modules/notifications/notifications.repository";
import { eventBus } from "@/realtime/eventBus";
import { NotFoundError } from "@/utils/errors";

const ALERT_DEDUP_TTL_SEC = 180;

interface AnomalyResult {
  isAnomaly: boolean;
  level: "info" | "warning" | "critical";
  reasons: string[];
}

function evaluateAnomaly(zone: ZoneRow, input: SensorInsertInput): AnomalyResult {
  const reasons: string[] = [];
  let level: AnomalyResult["level"] = "info";

  const t = input.temperature;
  if (typeof t === "number") {
    if (t < Number(zone.temp_min)) {
      reasons.push(`温度过低：${t}℃ < 下限 ${zone.temp_min}℃`);
      level = "critical";
    } else if (t > Number(zone.temp_max)) {
      reasons.push(`温度过高：${t}℃ > 上限 ${zone.temp_max}℃`);
      level = "critical";
    }
  }

  const h = input.humidity;
  if (typeof h === "number") {
    if (zone.humidity_min !== null && h < Number(zone.humidity_min)) {
      reasons.push(`湿度过低：${h}% < ${zone.humidity_min}%`);
      level = level === "critical" ? "critical" : "warning";
    } else if (zone.humidity_max !== null && h > Number(zone.humidity_max)) {
      reasons.push(`湿度过高：${h}% > ${zone.humidity_max}%`);
      level = level === "critical" ? "critical" : "warning";
    }
  }

  const c = input.co2;
  if (typeof c === "number" && zone.co2_max !== null && c > Number(zone.co2_max)) {
    reasons.push(`CO₂ 浓度超限：${c} ppm > ${zone.co2_max} ppm`);
    level = level === "critical" ? "critical" : "warning";
  }

  if (input.doorStatus === "open") {
    reasons.push("库门处于打开状态");
    if (level === "info") level = "warning";
  }

  return { isAnomaly: reasons.length > 0, level, reasons };
}

export interface IngestResult {
  data: PublicSensor;
  isAnomaly: boolean;
  reasons: string[];
}

export const sensorsService = {
  async ingest(input: SensorInsertInput): Promise<IngestResult> {
    const zone = await zonesRepo.findById(input.zoneId);
    if (!zone) throw new NotFoundError(`库区不存在: ${input.zoneId}`);

    const anomaly = evaluateAnomaly(zone, input);
    const insertId = await sensorsRepo.insert({ ...input, isAnomaly: anomaly.isAnomaly });
    const row = await sensorsRepo.latestByZone(zone.id);
    const data = toPublicSensor(row!); // 刚插入的一行
    void insertId;

    // 1) 实时数据点：所有点都广播（前端图表需要）
    eventBus
      .publishSensor({
        type: "sensor",
        zoneId: zone.id,
        zoneCode: zone.code,
        zoneName: zone.name,
        data,
      })
      .catch((err) => logger.warn({ err }, "publishSensor 失败"));

    // 2) 异常告警：去抖 + 持久化通知 + 事件总线
    if (anomaly.isAnomaly) {
      const dedupKey = `alert:dedup:${zone.id}:${anomaly.level}`;
      const ok = await redis.set(dedupKey, "1", "EX", ALERT_DEDUP_TTL_SEC, "NX");
      if (ok === "OK") {
        const title = `${zone.name} 出现 ${labelOfLevel(anomaly.level)}`;
        await notificationsRepo
          .create({
            userId: 0, // 广播
            type: "alert",
            title,
            content: anomaly.reasons.join("；"),
            payload: { zoneId: zone.id, level: anomaly.level, sensorId: data.id },
          })
          .catch((err) => logger.warn({ err }, "notifications 写入失败"));

        eventBus
          .publishAlert({
            type: "alert",
            zoneId: zone.id,
            zoneCode: zone.code,
            zoneName: zone.name,
            level: anomaly.level,
            reasons: anomaly.reasons,
            data,
          })
          .catch((err) => logger.warn({ err }, "publishAlert 失败"));
      } else {
        logger.debug({ zoneId: zone.id, level: anomaly.level }, "告警在去抖窗口内，跳过通知");
      }
    }

    return { data, isAnomaly: anomaly.isAnomaly, reasons: anomaly.reasons };
  },
};

function labelOfLevel(l: AnomalyResult["level"]): string {
  return l === "critical" ? "严重异常" : l === "warning" ? "异常" : "提示";
}
