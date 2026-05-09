/**
 * 库区数据访问层
 * --------------------------------
 * 字段含温/湿/CO₂ 阈值，作为传感器异常判定的依据。
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";

export interface ZoneRow {
  id: number;
  code: string;
  name: string;
  temp_min: number;
  temp_max: number;
  humidity_min: number | null;
  humidity_max: number | null;
  co2_max: number | null;
  description: string | null;
  is_public: number;
  created_at: Date;
  updated_at: Date;
}

export interface ZoneCreateInput {
  code: string;
  name: string;
  tempMin: number;
  tempMax: number;
  humidityMin?: number | null;
  humidityMax?: number | null;
  co2Max?: number | null;
  description?: string | null;
  isPublic?: boolean;
}

export type ZoneUpdateInput = Partial<ZoneCreateInput>;

const SELECT_COLS =
  "id, code, name, temp_min, temp_max, humidity_min, humidity_max, co2_max, description, is_public, created_at, updated_at";

export const zonesRepo = {
  async list(opts: { onlyPublic?: boolean } = {}): Promise<ZoneRow[]> {
    const where = opts.onlyPublic ? "WHERE is_public = 1" : "";
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM zones ${where} ORDER BY code ASC`,
    );
    return rows as ZoneRow[];
  },

  async findById(id: number): Promise<ZoneRow | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM zones WHERE id = ? LIMIT 1`,
      [id],
    );
    return (rows[0] as ZoneRow) ?? null;
  },

  async findByCode(code: string): Promise<ZoneRow | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM zones WHERE code = ? LIMIT 1`,
      [code],
    );
    return (rows[0] as ZoneRow) ?? null;
  },

  async create(input: ZoneCreateInput): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO zones
        (code, name, temp_min, temp_max, humidity_min, humidity_max, co2_max, description, is_public)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.code,
        input.name,
        input.tempMin,
        input.tempMax,
        input.humidityMin ?? null,
        input.humidityMax ?? null,
        input.co2Max ?? null,
        input.description ?? null,
        input.isPublic === false ? 0 : 1,
      ],
    );
    return result.insertId;
  },

  async update(id: number, patch: ZoneUpdateInput): Promise<void> {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    const map: Record<string, string> = {
      code: "code",
      name: "name",
      tempMin: "temp_min",
      tempMax: "temp_max",
      humidityMin: "humidity_min",
      humidityMax: "humidity_max",
      co2Max: "co2_max",
      description: "description",
    };
    for (const [k, col] of Object.entries(map)) {
      const v = (patch as Record<string, unknown>)[k];
      if (v !== undefined) {
        fields.push(`${col} = ?`);
        values.push(v as string | number | null);
      }
    }
    if (patch.isPublic !== undefined) {
      fields.push("is_public = ?");
      values.push(patch.isPublic ? 1 : 0);
    }
    if (!fields.length) return;
    values.push(id);
    await pool.execute(`UPDATE zones SET ${fields.join(", ")} WHERE id = ?`, values);
  },

  async remove(id: number): Promise<void> {
    await pool.execute("DELETE FROM zones WHERE id = ?", [id]);
  },
};

export function toPublicZone(row: ZoneRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    tempMin: Number(row.temp_min),
    tempMax: Number(row.temp_max),
    humidityMin: row.humidity_min !== null ? Number(row.humidity_min) : null,
    humidityMax: row.humidity_max !== null ? Number(row.humidity_max) : null,
    co2Max: row.co2_max !== null ? Number(row.co2_max) : null,
    description: row.description,
    isPublic: row.is_public === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type PublicZone = ReturnType<typeof toPublicZone>;
