-- =============================================================================
-- 历史增量：管理员 P1（工单 / 区域 / 库区归属 / 会员到期字段等）
--
-- 【重要】全新环境请仅执行 database/init/01_schema.sql，
--          以上内容已并入全量脚本，请勿重复执行本文件。
--
-- 本文件仅供：在早期仅跑过「旧版 01_schema.sql（无 work_orders）」的库上补缴一次。
-- 若已对 zones/users 手动执行过同名 ALTER，需跳过重复语句以免报错。
-- =============================================================================

USE `coldhero`;

ALTER TABLE `zones`
  ADD COLUMN `customer_id`     BIGINT UNSIGNED DEFAULT NULL COMMENT 'bound customer users.id' AFTER `id`,
  ADD COLUMN `device_sn`       VARCHAR(64)     DEFAULT NULL COMMENT 'device serial number',
  ADD COLUMN `current_ampere`  DECIMAL(6,2)    DEFAULT NULL COMMENT 'current amperes',
  ADD COLUMN `run_minutes`     INT             NOT NULL DEFAULT 0 COMMENT 'total run minutes',
  ADD COLUMN `is_online`       TINYINT(1)      NOT NULL DEFAULT 1,
  ADD COLUMN `last_seen_at`    DATETIME        DEFAULT NULL COMMENT 'last seen time';

ALTER TABLE `users`
  ADD COLUMN `region_id`         INT   DEFAULT NULL COMMENT 'regions.id',
  ADD COLUMN `member_expire_at`  DATE  DEFAULT NULL COMMENT 'member expiry date';

CREATE TABLE IF NOT EXISTS `regions` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `name`        VARCHAR(64) NOT NULL UNIQUE,
  `description` VARCHAR(256) DEFAULT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='admin regions';

CREATE TABLE IF NOT EXISTS `work_orders` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `fault_id`        BIGINT UNSIGNED NOT NULL,
  `assigned_to`     BIGINT UNSIGNED DEFAULT NULL,
  `status`          ENUM(
                      'pending',
                      'assigned',
                      'arrived',
                      'in_progress',
                      'done',
                      'closed',
                      'rejected'
                    ) NOT NULL DEFAULT 'pending',
  `auto_assigned`   TINYINT(1) NOT NULL DEFAULT 0,
  `arrival_time`    DATETIME DEFAULT NULL,
  `complete_time`   DATETIME DEFAULT NULL,
  `result_note`     TEXT,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_fault`  (`fault_id`),
  INDEX `idx_tech`   (`assigned_to`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='work orders';

CREATE TABLE IF NOT EXISTS `technician_status` (
  `user_id`          BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  `is_busy`          TINYINT(1) NOT NULL DEFAULT 0,
  `current_order_id` BIGINT UNSIGNED DEFAULT NULL,
  `updated_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='technician dispatch state';

CREATE TABLE IF NOT EXISTS `member_expire_reminders` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `remind_days` INT NOT NULL,
  `expire_at`   DATE NOT NULL,
  `is_sent`     TINYINT(1) NOT NULL DEFAULT 0,
  `sent_at`     DATETIME DEFAULT NULL,
  INDEX `idx_user`   (`user_id`),
  INDEX `idx_expire` (`expire_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='member expiry reminders P2';
