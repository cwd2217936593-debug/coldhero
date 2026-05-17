/**
 * 库区数据访问层
 * --------------------------------
 * 字段含温/湿/CO₂ 阈值，作为传感器异常判定的依据。
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";

export interface ZoneRow {
  id: number;
  customer_id: number | null;
  code: string;
  name: string;
  temp_min: number;
  temp_max: number;
  humidity_min: number | null;
  humidity_max: number | null;
  co2_max: number | null;
  description: string | null;
  is_public: number;
  device_sn: string | null;
  current_ampere: string | number | null;
  run_minutes: number;
  is_online: number;
  last_seen_at: Date | null;
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
  "id, customer_id, code, name, temp_min, temp_max, humidity_min, humidity_max, co2_max, description, is_public, device_sn, current_ampere, run_minutes, is_online, last_seen_at, created_at, updated_at";

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

  async findByIds(ids: number[]): Promise<ZoneRow[]> {
    if (!ids.length) return [];
    const ph = ids.map(() => "?").join(",");
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM zones WHERE id IN (${ph})`,
      ids,
    );
    return rows as ZoneRow[];
  },

  /** 与客户账号关联的库区 id（bindings 与 zones.customer_id 并集，兼容存量数据） */
  async findZoneIdsBoundToCustomer(customerId: number): Promise<number[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT zid FROM (
        SELECT zone_id AS zid FROM user_zone_bindings WHERE user_id = ? AND unbound_at IS NULL
        UNION
        SELECT id AS zid FROM zones WHERE customer_id = ?
      ) t`,
      [customerId, customerId],
    );
    return (rows as { zid: number }[]).map((r) => Number(r.zid));
  },

  /** 对该客户可新绑定的库区：无他人 active 占用，且 customer_id 为空或仍为本人 */
  async listAvailableForBinding(forUserId: number, keyword?: string): Promise<ZoneRow[]> {
    const args: unknown[] = [forUserId, forUserId];
    let extra = "";
    if (keyword?.trim()) {
      extra = " AND (z.name LIKE ? OR COALESCE(z.device_sn,'') LIKE ?)";
      const p = `%${keyword.trim()}%`;
      args.push(p, p);
    }
    const zcols = SELECT_COLS.split(", ").map((c) => `z.${c}`).join(", ");
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${zcols}
       FROM zones z
       WHERE NOT EXISTS (
         SELECT 1 FROM user_zone_bindings b
         WHERE b.zone_id = z.id AND b.unbound_at IS NULL AND b.user_id <> ?
       )
       AND (z.customer_id IS NULL OR z.customer_id = ?)
       ${extra}
       ORDER BY z.code ASC`,
      args,
    );
    return rows as ZoneRow[];
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

  /**
   * 设置客户名下冷库绑定（覆盖式）：先清空该客户原有一切绑定，再将 zoneIds 设为本客户。
   * 提示词 Step 8：更新 zones.customer_id；与前端「保存后覆盖绑定」一致。
   */
  async setCustomerZones(customerId: number, zoneIds: number[]): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(`UPDATE zones SET customer_id = NULL WHERE customer_id = ?`, [customerId]);
      if (zoneIds.length) {
        const ph = zoneIds.map(() => "?").join(",");
        await conn.execute(`UPDATE zones SET customer_id = ? WHERE id IN (${ph})`, [customerId, ...zoneIds]);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  },

  /**
   * @deprecated 请用 setCustomerZones；保证「覆盖绑定」语义
   */
  async bindToCustomer(zoneIds: number[], customerId: number): Promise<void> {
    return this.setCustomerZones(customerId, zoneIds);
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
