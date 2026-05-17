/**
 * 用户表数据访问层
 * --------------------------------
 * - 仅做 SQL 与行 → 对象映射，不做业务校验
 * - 业务流程（哈希、JWT、校验）在 service 层
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";
import type { MemberLevel } from "@/config/memberPlans";

export type UserRole = "admin" | "operator" | "viewer";
export type UserStatus = "active" | "disabled";

export interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  member_level: MemberLevel;
  phone: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  region_id: number | null;
  member_expire_at: Date | null;
  zone_limit: number;
  created_by: number | null;
  notes: string | null;
}

export type AdminUserListRow = UserRow & {
  region_name: string | null;
  creator_name: string | null;
  bound_zone_count: number;
};

export interface CreateUserInput {
  username: string;
  email: string;
  passwordHash: string;
  displayName?: string;
  phone?: string;
  memberLevel?: MemberLevel;
  role?: UserRole;
}

export const usersRepo = {
  async findById(id: number): Promise<UserRow | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE id = ? LIMIT 1",
      [id],
    );
    return (rows[0] as UserRow) ?? null;
  },

  async findByUsername(username: string): Promise<UserRow | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE username = ? LIMIT 1",
      [username],
    );
    return (rows[0] as UserRow) ?? null;
  },

  async findByEmail(email: string): Promise<UserRow | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    return (rows[0] as UserRow) ?? null;
  },

  async findByPhone(phone: string): Promise<UserRow | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE phone = ? LIMIT 1",
      [phone],
    );
    return (rows[0] as UserRow) ?? null;
  },

  /** 同时支持用户名或邮箱定位（登录使用） */
  async findByIdentifier(identifier: string): Promise<UserRow | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1",
      [identifier, identifier],
    );
    return (rows[0] as UserRow) ?? null;
  },

  async create(input: CreateUserInput): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO users
        (username, email, password_hash, member_level, phone, display_name, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.username,
        input.email,
        input.passwordHash,
        input.memberLevel ?? "free",
        input.phone ?? null,
        input.displayName ?? null,
        input.role ?? "viewer",
      ],
    );
    return result.insertId;
  },

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await pool.execute(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [passwordHash, userId],
    );
  },

  async updateLastLogin(userId: number): Promise<void> {
    await pool.execute(
      "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
      [userId],
    );
  },

  async updateMemberLevel(userId: number, level: MemberLevel): Promise<void> {
    await pool.execute(
      "UPDATE users SET member_level = ? WHERE id = ?",
      [level, userId],
    );
  },

  async updateProfile(
    userId: number,
    patch: { displayName?: string | null; phone?: string | null; avatarUrl?: string | null },
  ): Promise<void> {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    if (patch.displayName !== undefined) {
      fields.push("display_name = ?");
      values.push(patch.displayName);
    }
    if (patch.phone !== undefined) {
      fields.push("phone = ?");
      values.push(patch.phone);
    }
    if (patch.avatarUrl !== undefined) {
      fields.push("avatar_url = ?");
      values.push(patch.avatarUrl);
    }
    if (!fields.length) return;
    values.push(userId);
    await pool.execute(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
  },

  async listForAdmin(opts: {
    role?: UserRole;
    keyword?: string;
    regionId?: number;
    page: number;
    size: number;
  }): Promise<{ items: UserRow[]; total: number }> {
    const conds: string[] = ["1=1"];
    const args: unknown[] = [];
    if (opts.role !== undefined) {
      conds.push("role = ?");
      args.push(opts.role);
    }
    if (opts.keyword) {
      conds.push("(username LIKE ? OR phone LIKE ? OR display_name LIKE ? OR email LIKE ?)");
      const k = `%${opts.keyword}%`;
      args.push(k, k, k, k);
    }
    if (opts.regionId !== undefined) {
      conds.push("region_id = ?");
      args.push(opts.regionId);
    }
    const where = conds.join(" AND ");
    const size = Math.min(Math.max(opts.size, 1), 5000);
    const offset = Math.max((opts.page - 1) * size, 0);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM users WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...args, size, offset],
    );
    const [cnt] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM users WHERE ${where}`,
      args,
    );
    return { items: rows as UserRow[], total: Number((cnt[0] as { c: number }).c) };
  },

  /** 管理端列表（含区域名、创建人、绑定冷库数） */
  async listAdminDetailed(opts: {
    role?: UserRole;
    memberLevel?: MemberLevel;
    regionId?: number;
    status?: UserStatus | "all";
    keyword?: string;
    expiringSoon?: boolean;
    page: number;
    size: number;
  }): Promise<{ items: AdminUserListRow[]; total: number }> {
    const conds: string[] = ["1=1"];
    const args: unknown[] = [];
    if (opts.role !== undefined) {
      conds.push("u.role = ?");
      args.push(opts.role);
    }
    if (opts.memberLevel !== undefined) {
      conds.push("u.member_level = ?");
      args.push(opts.memberLevel);
    }
    if (opts.keyword) {
      conds.push("(u.username LIKE ? OR u.phone LIKE ? OR u.display_name LIKE ? OR u.email LIKE ?)");
      const k = `%${opts.keyword}%`;
      args.push(k, k, k, k);
    }
    if (opts.regionId !== undefined) {
      conds.push("u.region_id = ?");
      args.push(opts.regionId);
    }
    if (!opts.status || opts.status !== "all") {
      conds.push("u.status = ?");
      args.push(opts.status ?? "active");
    }
    if (opts.expiringSoon) {
      conds.push("u.member_expire_at IS NOT NULL");
      conds.push("u.member_expire_at <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)");
      conds.push("u.member_expire_at >= CURDATE()");
    }
    const where = conds.join(" AND ");
    const size = Math.min(Math.max(opts.size, 1), 100);
    const offset = Math.max((opts.page - 1) * size, 0);

    const boundSub = `(
      SELECT COUNT(DISTINCT zz.zid) FROM (
        SELECT b.zone_id AS zid FROM user_zone_bindings b WHERE b.user_id = u.id AND b.unbound_at IS NULL
        UNION
        SELECT z.id AS zid FROM zones z WHERE z.customer_id = u.id
      ) zz
    )`;

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.*,
        r.name AS region_name,
        COALESCE(uc.display_name, uc.username) AS creator_name,
        ${boundSub} AS bound_zone_count
       FROM users u
       LEFT JOIN regions r ON r.id = u.region_id
       LEFT JOIN users uc ON uc.id = u.created_by
       WHERE ${where}
       ORDER BY u.id DESC
       LIMIT ? OFFSET ?`,
      [...args, size, offset],
    );
    const [cnt] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM users u WHERE ${where}`,
      args,
    );
    return {
      items: rows as AdminUserListRow[],
      total: Number((cnt[0] as { c: number }).c),
    };
  },

  async countCustomerZones(customerId: number): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM zones WHERE customer_id = ?",
      [customerId],
    );
    return Number((rows[0] as { c: number }).c);
  },

  /** 批量查询客户绑定冷库数量（避免管理端列表 N+1） */
  async countZonesForCustomerIds(customerIds: number[]): Promise<Map<number, number>> {
    const m = new Map<number, number>();
    if (!customerIds.length) return m;
    const uniq = [...new Set(customerIds)];
    const ph = uniq.map(() => "?").join(",");
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT customer_id AS cid, COUNT(*) AS c FROM zones WHERE customer_id IN (${ph}) GROUP BY customer_id`,
      uniq,
    );
    for (const r of rows as { cid: number; c: number }[]) {
      m.set(Number(r.cid), Number(r.c));
    }
    return m;
  },

  async createFull(
    input: {
      username: string;
      email: string;
      passwordHash: string;
      phone?: string | null;
      displayName?: string | null;
      memberLevel: MemberLevel;
      role: UserRole;
      regionId?: number | null;
      memberExpireAt?: Date | null;
      zoneLimit?: number;
      notes?: string | null;
      createdBy?: number | null;
    },
    conn?: import("mysql2/promise").PoolConnection,
  ): Promise<number> {
    const exec = conn ?? pool;
    const [result] = await exec.execute<ResultSetHeader>(
      `INSERT INTO users
        (username, email, password_hash, member_level, phone, display_name, role, region_id, member_expire_at, zone_limit, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.username,
        input.email,
        input.passwordHash,
        input.memberLevel,
        input.phone ?? null,
        input.displayName ?? input.username,
        input.role,
        input.regionId ?? null,
        input.memberExpireAt ?? null,
        input.zoneLimit ?? 1,
        input.notes ?? null,
        input.createdBy ?? null,
      ],
    );
    return result.insertId;
  },

  async updateAdminProfile(
    userId: number,
    patch: {
      memberLevel?: MemberLevel;
      regionId?: number | null;
      status?: UserStatus;
      memberExpireAt?: Date | null;
      phone?: string | null;
      displayName?: string | null;
      email?: string | null;
      notes?: string | null;
      zoneLimit?: number;
    },
  ): Promise<void> {
    const fields: string[] = [];
    const vals: unknown[] = [];
    if (patch.memberLevel !== undefined) {
      fields.push("member_level = ?");
      vals.push(patch.memberLevel);
    }
    if (patch.regionId !== undefined) {
      fields.push("region_id = ?");
      vals.push(patch.regionId);
    }
    if (patch.status !== undefined) {
      fields.push("status = ?");
      vals.push(patch.status);
    }
    if (patch.memberExpireAt !== undefined) {
      fields.push("member_expire_at = ?");
      vals.push(patch.memberExpireAt);
    }
    if (patch.phone !== undefined) {
      fields.push("phone = ?");
      vals.push(patch.phone);
    }
    if (patch.displayName !== undefined) {
      fields.push("display_name = ?");
      vals.push(patch.displayName);
    }
    if (patch.email !== undefined) {
      fields.push("email = ?");
      vals.push(patch.email);
    }
    if (patch.notes !== undefined) {
      fields.push("notes = ?");
      vals.push(patch.notes);
    }
    if (patch.zoneLimit !== undefined) {
      fields.push("zone_limit = ?");
      vals.push(patch.zoneLimit);
    }
    if (!fields.length) return;
    vals.push(userId);
    await pool.execute(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      vals as (string | number | Date | null)[],
    );
  },

  async listActiveUserIdsByRole(role: UserRole): Promise<number[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE role = ? AND status = 'active'",
      [role],
    );
    return (rows as { id: number }[]).map((r) => r.id);
  },
};

/** 客户端可见用户信息（不包含会员等级，仅供 /api/auth、/api/users 等 C 端接口） */
export function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    phone: row.phone,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    status: row.status === "active" ? 1 : 0,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
