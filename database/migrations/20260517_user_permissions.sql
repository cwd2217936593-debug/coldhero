-- =============================================================================
-- Admin 用户权限模块 · Step 1（会员档位 professional、账号状态 ENUM、冷库绑定日志）
--
-- 适用：当前库结构与仓库 database/init/01_schema.sql（users.status 为 TINYINT）一致。
-- 执行前请在业务库执行：SHOW FULL COLUMNS FROM users;
--
-- MySQL 8.0.29+：`ADD COLUMN IF NOT EXISTS`；更早版本请按需删掉 IF NOT EXISTS 或手工跳过已存在列。
-- =============================================================================

USE `coldhero`;

-- -----------------------------------------------------------------------------
-- 1. 等级变更日志
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_level_logs` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `from_level` VARCHAR(32)      DEFAULT NULL,
  `to_level`   VARCHAR(32)      NOT NULL,
  `changed_by` BIGINT UNSIGNED  NOT NULL COMMENT '操作管理员 users.id',
  `reason`     VARCHAR(256)     DEFAULT NULL COMMENT '变更原因（选填）',
  `created_at` DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_time` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户会员等级变更记录';

-- -----------------------------------------------------------------------------
-- 2. 冷库绑定（NULL unbound_at = 当前绑定中；函数唯一索引避免同一用户冷库多条 active）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_zone_bindings` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `zone_id`     BIGINT UNSIGNED NOT NULL,
  `bound_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `unbound_at`  DATETIME        DEFAULT NULL COMMENT 'NULL 表示当前绑定中',
  `bound_by`    BIGINT UNSIGNED DEFAULT NULL COMMENT '操作管理员 users.id',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_active_user_zone` (
    (CASE WHEN `unbound_at` IS NULL THEN CONCAT_WS(':', `user_id`, `zone_id`) ELSE NULL END)
  ),
  KEY `idx_user` (`user_id`),
  KEY `idx_zone` (`zone_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户-冷库绑定（含历史）';

-- -----------------------------------------------------------------------------
-- 3. member_level：`pro` → `professional`（与产品枚举对齐）
-- -----------------------------------------------------------------------------
ALTER TABLE `users`
  MODIFY COLUMN `member_level`
    ENUM('free','basic','pro','professional','enterprise')
    NOT NULL DEFAULT 'free'
    COMMENT '会员档位（仅后台/API 管理端明文）';

UPDATE `users` SET `member_level` = 'professional' WHERE `member_level` = 'pro';

ALTER TABLE `users`
  MODIFY COLUMN `member_level`
    ENUM('free','basic','professional','enterprise')
    NOT NULL DEFAULT 'free'
    COMMENT '会员档位（仅后台/API 管理端明文）';

-- -----------------------------------------------------------------------------
-- 4. 补充字段
-- -----------------------------------------------------------------------------
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `zone_limit`
    INT NOT NULL DEFAULT 1
    COMMENT '允许绑定的最大冷库数（-1=不限；可覆盖等级默认）'
    AFTER `region_id`,
  ADD COLUMN IF NOT EXISTS `created_by`
    BIGINT UNSIGNED DEFAULT NULL
    COMMENT '创建该账号的管理员 users.id'
    AFTER `last_login_at`,
  ADD COLUMN IF NOT EXISTS `notes`
    TEXT DEFAULT NULL
    COMMENT '管理员备注（不对客户展示）'
    AFTER `created_by`;

-- -----------------------------------------------------------------------------
-- 5. status：TINYINT(1=启用,0=禁用) → ENUM（若已是 ENUM 请勿重复执行本节）
-- -----------------------------------------------------------------------------
ALTER TABLE `users`
  ADD COLUMN `status_enum` ENUM('active','disabled') NOT NULL DEFAULT 'active'
    COMMENT '账号状态'
    AFTER `status`;

UPDATE `users` SET `status_enum` = IF(`status` = 1, 'active', 'disabled');

ALTER TABLE `users` DROP COLUMN `status`;

ALTER TABLE `users` CHANGE COLUMN `status_enum` `status`
  ENUM('active','disabled') NOT NULL DEFAULT 'active'
  COMMENT '账号状态';

-- -----------------------------------------------------------------------------
-- 可选：将存量 zones.customer_id 迁入绑定表（执行前请确认无重复 active 语义冲突）
-- -----------------------------------------------------------------------------
-- INSERT INTO `user_zone_bindings` (`user_id`, `zone_id`, `bound_at`, `unbound_at`, `bound_by`)
-- SELECT `customer_id`, `id`, `created_at`, NULL, NULL
-- FROM `zones`
-- WHERE `customer_id` IS NOT NULL;
