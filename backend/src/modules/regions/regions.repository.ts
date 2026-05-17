/**
 * 管理区域 regions 表 DAO
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";

export interface RegionRow {
  id: number;
  name: string;
  description: string | null;
  created_at: Date;
}

export const regionsRepo = {
  async list(): Promise<RegionRow[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, name, description, created_at FROM regions ORDER BY id ASC",
    );
    return rows as RegionRow[];
  },

  async findById(id: number): Promise<RegionRow | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, name, description, created_at FROM regions WHERE id = ? LIMIT 1",
      [id],
    );
    return (rows[0] as RegionRow) ?? null;
  },

  async create(input: { name: string; description?: string | null }): Promise<number> {
    const [r] = await pool.execute<ResultSetHeader>(
      "INSERT INTO regions (name, description) VALUES (?, ?)",
      [input.name, input.description ?? null],
    );
    return r.insertId;
  },

  async update(
    id: number,
    patch: { name?: string; description?: string | null },
  ): Promise<void> {
    const fields: string[] = [];
    const vals: unknown[] = [];
    if (patch.name !== undefined) {
      fields.push("name = ?");
      vals.push(patch.name);
    }
    if (patch.description !== undefined) {
      fields.push("description = ?");
      vals.push(patch.description);
    }
    if (!fields.length) return;
    vals.push(id);
    await pool.execute(
      `UPDATE regions SET ${fields.join(", ")} WHERE id = ?`,
      vals as (string | number | null)[],
    );
  },
};
