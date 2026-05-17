/**
 * 用户 ↔ 冷库绑定（user_zone_bindings + 同步 zones.customer_id）
 */

import type { ResultSetHeader } from "mysql2";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { pool } from "@/db/mysql";

export type SqlExecutor = Pick<PoolConnection, "execute">;

export const userZoneBindingsRepo = {
  /** 空闲冷库被他人占用：zones.customer_id 或 active binding */
  async findConflictsForZones(
    zoneIds: number[],
    excludeUserId: number,
  ): Promise<Array<{ zoneId: number; holderUserId: number; holderUsername: string }>> {
    if (!zoneIds.length) return [];
    const ph = zoneIds.map(() => "?").join(",");
    const args = [...zoneIds, excludeUserId];
    const [viaZones] = await pool.query<RowDataPacket[]>(
      `SELECT z.id AS zone_id, u.id AS holder_user_id, u.username AS holder_username
       FROM zones z
       INNER JOIN users u ON u.id = z.customer_id
       WHERE z.id IN (${ph}) AND z.customer_id IS NOT NULL AND z.customer_id <> ?`,
      args,
    );
    const [viaBind] = await pool.query<RowDataPacket[]>(
      `SELECT zb.zone_id AS zone_id, u.id AS holder_user_id, u.username AS holder_username
       FROM user_zone_bindings zb
       INNER JOIN users u ON u.id = zb.user_id
       WHERE zb.zone_id IN (${ph}) AND zb.unbound_at IS NULL AND zb.user_id <> ?`,
      args,
    );
    const m = new Map<number, { holderUserId: number; holderUsername: string }>();
    const merged = [...viaZones, ...viaBind] as Array<{
      zone_id: number;
      holder_user_id: number;
      holder_username: string;
    }>;
    for (const r of merged) {
      const zid = Number(r.zone_id);
      if (!m.has(zid)) {
        m.set(zid, {
          holderUserId: Number(r.holder_user_id),
          holderUsername: String(r.holder_username),
        });
      }
    }
    return [...m.entries()].map(([zoneId, v]) => ({ zoneId, ...v }));
  },

  async bindZone(exec: SqlExecutor, userId: number, zoneId: number, boundBy: number): Promise<void> {
    await exec.execute(
      `INSERT INTO user_zone_bindings (user_id, zone_id, bound_by) VALUES (?, ?, ?)`,
      [userId, zoneId, boundBy],
    );
    await exec.execute(`UPDATE zones SET customer_id = ? WHERE id = ?`, [userId, zoneId]);
  },

  async unbindZone(userId: number, zoneId: number): Promise<void> {
    await pool.execute(
      `UPDATE user_zone_bindings SET unbound_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND zone_id = ? AND unbound_at IS NULL`,
      [userId, zoneId],
    );
    await pool.execute<ResultSetHeader>(
      `UPDATE zones SET customer_id = NULL WHERE id = ? AND customer_id = ?`,
      [zoneId, userId],
    );
  },
};
