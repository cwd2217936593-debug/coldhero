/**
 * 一次性脚本：将种子用户的密码统一重置为 Coldhero@123
 * --------------------------------
 * 使用：npm run seed:passwords
 *
 * 因为 02_seed.sql 中的 password_hash 是占位串（无法登录），
 * 启动后请运行该脚本生成真实 bcrypt 哈希。
 */

import bcrypt from "bcrypt";
import { pool, closeMysql } from "@/db/mysql";
import { logger } from "@/utils/logger";

const DEFAULT_PASSWORD = "Coldhero@123";
const SEED_USERNAMES = ["admin", "demo_free", "demo_basic", "demo_pro", "demo_ent"];

async function main() {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const [result] = await pool.query(
    "UPDATE users SET password_hash = ? WHERE username IN (?)",
    [hash, SEED_USERNAMES],
  );
  logger.info({ result }, `✅ 已重置 ${SEED_USERNAMES.length} 个种子用户密码为 ${DEFAULT_PASSWORD}`);
}

main()
  .catch((err) => {
    logger.error({ err }, "种子密码重置失败");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMysql();
  });
