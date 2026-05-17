/**
 * 传感器历史数据 DAO
 * --------------------------------
 * 写入频率高，查询多以「库区 + 时间窗」为主：
 *   - 当前快照：每个库区取最新一条
 *   - 实时曲线：最近 N 小时的全部点
 *   - 历史查询：任意时间区间 + 抽样降采（后续阶段 6 实现）
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";

export type DoorStatus = "open" | "closed" | "unknown";

export interface SensorRow {
  id: number;
  zone_id: number;
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  door_status: DoorStatus;
  is_anomaly: number;
  recorded_at: Date;
}

export interface SensorInsertInput {
  zoneId: number;
  temperature?: number | null;
  humidity?: number | null;
  co2?: number | null;
  doorStatus?: DoorStatus;
  isAnomaly?: boolean;
  recordedAt?: Date;
}

export const sensorsRepo = {
  async insert(input: SensorInsertInput): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO sensor_history
        (zone_id, temperature, humidity, co2, door_status, is_anomaly, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.zoneId,
        input.temperature ?? null,
        input.humidity ?? null,
        input.co2 ?? null,
        input.doorStatus ?? "unknown",
        input.isAnomaly ? 1 : 0,
        input.recordedAt ?? new Date(),
      ],
    );
    return result.insertId;
  },

  /**
   * 每个库区返回最新一条（快照）
   * 用 LEFT JOIN + 子查询取每组 max(recorded_at)
   */
  async latestPerZone(): Promise<SensorRow[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT s.* FROM sensor_history s
       INNER JOIN (
         SELECT zone_id, MAX(recorded_at) AS mx
         FROM sensor_history GROUP BY zone_id
       ) t ON t.zone_id = s.zone_id AND t.mx = s.recorded_at`,
    );
    return rows as SensorRow[];
  },

  async latestByZone(zoneId: number): Promise<SensorRow | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM sensor_history WHERE zone_id = ?
       ORDER BY recorded_at DESC LIMIT 1`,
      [zoneId],
    );
    return (rows[0] as SensorRow) ?? null;
  },

  /** 时间区间序列（升序），可设置最大点数防超大查询 */
  async seriesByZone(
    zoneId: number,
    fromAt: Date,
    toAt: Date,
    limit = 5000,
  ): Promise<SensorRow[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM sensor_history
       WHERE zone_id = ? AND recorded_at >= ? AND recorded_at <= ?
       ORDER BY recorded_at ASC LIMIT ?`,
      [zoneId, fromAt, toAt, limit],
    );
    return rows as SensorRow[];
  },

  /**
   * 时间区间内「最近」若干条（按时间升序返回，便于折线图）
   * 解决 ASC LIMIT 取到的是窗口内最旧一段的问题。
   */
  async latestSeriesByZone(
    zoneId: number,
    fromAt: Date,
    toAt: Date,
    maxPoints: number,
  ): Promise<SensorRow[]> {
    const cap = Math.min(Math.max(maxPoints, 1), 500);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM (
         SELECT * FROM sensor_history
         WHERE zone_id = ? AND recorded_at >= ? AND recorded_at <= ?
         ORDER BY recorded_at DESC
         LIMIT ?
       ) t ORDER BY recorded_at ASC`,
      [zoneId, fromAt, toAt, cap],
    );
    return rows as SensorRow[];
  },

  /**
   * 按时间桶聚合（AVG 温/湿/CO₂、MAX is_anomaly）
   * bucketSec=0 表示原始点（直接复用 seriesByZone 即可，本方法不处理）
   */
  async aggregateByZone(
    zoneId: number,
    fromAt: Date,
    toAt: Date,
    bucketSec: number,
    limit = 5000,
  ): Promise<AggregatedPoint[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(recorded_at) / ?) * ?) AS bucket,
         AVG(temperature) AS temperature,
         AVG(humidity)    AS humidity,
         AVG(co2)         AS co2,
         MAX(is_anomaly)  AS is_anomaly,
         COUNT(*)         AS sample_count
       FROM sensor_history
       WHERE zone_id = ? AND recorded_at >= ? AND recorded_at <= ?
       GROUP BY bucket
       ORDER BY bucket ASC
       LIMIT ?`,
      [bucketSec, bucketSec, zoneId, fromAt, toAt, limit],
    );
    return (rows as RowDataPacket[]).map((r) => ({
      bucket: r.bucket as Date,
      temperature: r.temperature !== null ? Number(r.temperature) : null,
      humidity: r.humidity !== null ? Number(r.humidity) : null,
      co2: r.co2 !== null ? Number(r.co2) : null,
      isAnomaly: Number(r.is_anomaly) === 1,
      sampleCount: Number(r.sample_count),
    }));
  },
};

export interface AggregatedPoint {
  bucket: Date;
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  isAnomaly: boolean;
  sampleCount: number;
}

export function toPublicSensor(row: SensorRow) {
  return {
    id: row.id,
    zoneId: row.zone_id,
    temperature: row.temperature !== null ? Number(row.temperature) : null,
    humidity: row.humidity !== null ? Number(row.humidity) : null,
    co2: row.co2 !== null ? Number(row.co2) : null,
    doorStatus: row.door_status,
    isAnomaly: row.is_anomaly === 1,
    recordedAt: row.recorded_at,
  };
}

export type PublicSensor = ReturnType<typeof toPublicSensor>;
