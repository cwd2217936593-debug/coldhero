/**
 * 工单 work_orders + 维修人员状态 technician_status DAO
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";
import { pool } from "@/db/mysql";

type SqlExecutor = Pick<Pool, "execute">;

export type WorkOrderStatus =
  | "pending"
  | "assigned"
  | "arrived"
  | "in_progress"
  | "done"
  | "closed"
  | "rejected";

export interface WorkOrderRow {
  id: number;
  fault_id: number;
  assigned_to: number | null;
  status: WorkOrderStatus;
  auto_assigned: number;
  arrival_time: Date | null;
  complete_time: Date | null;
  result_note: string | null;
  created_at: Date;
  updated_at: Date;
}

export const workOrdersRepo = {
  /** 进行中工单是否关联该用户（报障人或被指派的维修人员） */
  async countActiveTouchingUser(userId: number): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM work_orders wo
       LEFT JOIN fault_reports fr ON fr.id = wo.fault_id
       WHERE wo.status IN ('assigned','arrived','in_progress')
       AND (wo.assigned_to = ? OR fr.user_id = ?)`,
      [userId, userId],
    );
    return Number((rows[0] as { c: number }).c);
  },

  async insert(
    exec: SqlExecutor,
    input: {
      faultId: number;
      assignedTo: number | null;
      status: WorkOrderStatus;
      autoAssigned: boolean;
      resultNote?: string | null;
    },
  ): Promise<number> {
    const [r] = await exec.execute<ResultSetHeader>(
      `INSERT INTO work_orders (fault_id, assigned_to, status, auto_assigned, result_note)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.faultId,
        input.assignedTo,
        input.status,
        input.autoAssigned ? 1 : 0,
        input.resultNote ?? null,
      ],
    );
    return r.insertId;
  },

  async findById(id: number): Promise<WorkOrderRow | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM work_orders WHERE id = ? LIMIT 1",
      [id],
    );
    return (rows[0] as WorkOrderRow) ?? null;
  },

  async updateWithExec(
    exec: SqlExecutor,
    id: number,
    patch: {
      status?: WorkOrderStatus;
      assignedTo?: number | null;
      arrivalTime?: Date | null;
      completeTime?: Date | null;
      resultNote?: string | null;
    },
  ): Promise<void> {
    const fields: string[] = [];
    const vals: unknown[] = [];
    if (patch.status !== undefined) {
      fields.push("status = ?");
      vals.push(patch.status);
    }
    if (patch.assignedTo !== undefined) {
      fields.push("assigned_to = ?");
      vals.push(patch.assignedTo);
    }
    if (patch.arrivalTime !== undefined) {
      fields.push("arrival_time = ?");
      vals.push(patch.arrivalTime);
    }
    if (patch.completeTime !== undefined) {
      fields.push("complete_time = ?");
      vals.push(patch.completeTime);
    }
    if (patch.resultNote !== undefined) {
      fields.push("result_note = ?");
      vals.push(patch.resultNote);
    }
    if (!fields.length) return;
    vals.push(id);
    await exec.execute(
      `UPDATE work_orders SET ${fields.join(", ")} WHERE id = ?`,
      vals as (string | number | Date | null)[],
    );
  },

  async update(
    id: number,
    patch: {
      status?: WorkOrderStatus;
      assignedTo?: number | null;
      arrivalTime?: Date | null;
      completeTime?: Date | null;
      resultNote?: string | null;
    },
  ): Promise<void> {
    return this.updateWithExec(pool, id, patch);
  },

  async listWithDetails(opts: {
    status?: WorkOrderStatus;
    customerId?: number;
    zoneId?: number;
    page: number;
    size: number;
  }): Promise<{
    items: Array<
      WorkOrderRow & {
        fault_title: string;
        fault_type: string;
        zone_name: string | null;
        customer_name: string | null;
        tech_name: string | null;
      }
    >;
    total: number;
  }> {
    const conds: string[] = ["1=1"];
    const args: unknown[] = [];
    if (opts.status) {
      conds.push("wo.status = ?");
      args.push(opts.status);
    }
    if (opts.customerId !== undefined) {
      conds.push("fr.user_id = ?");
      args.push(opts.customerId);
    }
    if (opts.zoneId !== undefined) {
      conds.push("fr.zone_id = ?");
      args.push(opts.zoneId);
    }
    const where = conds.join(" AND ");
    const size = Math.min(Math.max(opts.size, 1), 100);
    const offset = Math.max((opts.page - 1) * size, 0);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT wo.*,
        fr.title AS fault_title,
        fr.fault_type AS fault_type,
        z.name AS zone_name,
        COALESCE(cust.display_name, cust.username) AS customer_name,
        COALESCE(tech.display_name, tech.username) AS tech_name
       FROM work_orders wo
       INNER JOIN fault_reports fr ON fr.id = wo.fault_id
       LEFT JOIN zones z ON z.id = fr.zone_id
       LEFT JOIN users cust ON cust.id = fr.user_id
       LEFT JOIN users tech ON tech.id = wo.assigned_to
       WHERE ${where}
       ORDER BY wo.created_at DESC
       LIMIT ? OFFSET ?`,
      [...args, size, offset],
    );
    const [cnt] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c
       FROM work_orders wo
       INNER JOIN fault_reports fr ON fr.id = wo.fault_id
       WHERE ${where}`,
      args,
    );
    return {
      items: rows as Array<
        WorkOrderRow & {
          fault_title: string;
          fault_type: string;
          zone_name: string | null;
          customer_name: string | null;
          tech_name: string | null;
        }
      >,
      total: Number((cnt[0] as { c: number }).c),
    };
  },
};

export const technicianStatusRepo = {
  async isBusy(userId: number): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT is_busy FROM technician_status WHERE user_id = ? LIMIT 1",
      [userId],
    );
    if (!rows[0]) return false;
    return Number((rows[0] as { is_busy: number }).is_busy) === 1;
  },

  async ensureRow(userId: number): Promise<void> {
    await pool.execute(
      `INSERT IGNORE INTO technician_status (user_id, is_busy) VALUES (?, 0)`,
      [userId],
    );
  },

  async setBusy(
    conn: PoolConnection,
    userId: number,
    busy: boolean,
    orderId: number | null,
  ): Promise<void> {
    await conn.execute(
      `UPDATE technician_status SET is_busy = ?, current_order_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [busy ? 1 : 0, orderId, userId],
    );
  },

  /** 加行锁挑选最久未更新的空闲维修人员（事务内调用；仅 role=operator 且账号启用） */
  async pickIdleTechnician(conn: PoolConnection): Promise<number  | null> {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT ts.user_id AS user_id
       FROM technician_status ts
       INNER JOIN users u ON u.id = ts.user_id AND u.role = 'operator' AND u.status = 'active'
       WHERE ts.is_busy = 0
       ORDER BY ts.updated_at ASC
       LIMIT 1
       FOR UPDATE`,
    );
    if (!rows[0]) return null;
    return Number((rows[0] as { user_id: number }).user_id);
  },

  async releaseForOrderExec(exec: SqlExecutor, userId: number, orderId: number): Promise<void> {
    await exec.execute(
      `UPDATE technician_status SET is_busy = 0, current_order_id = NULL
       WHERE user_id = ? AND current_order_id = ?`,
      [userId, orderId],
    );
  },

  async releaseForCompletedOrder(userId: number, orderId: number): Promise<void> {
    return this.releaseForOrderExec(pool, userId, orderId);
  },
};
