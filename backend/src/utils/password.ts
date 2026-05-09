/**
 * 密码哈希工具（bcrypt）
 * --------------------------------
 * 统一在此处管理 saltRounds，避免散落多处。
 * 默认 10 轮：在现代服务器约 80~150ms，安全/性能折中。
 */

import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}
