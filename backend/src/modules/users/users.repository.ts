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
  status: number;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

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
};

/** 行 → 对外 DTO（剔除密码哈希等敏感字段） */
export function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    memberLevel: row.member_level,
    phone: row.phone,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
