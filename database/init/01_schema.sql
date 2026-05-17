-- =============================================================
-- 冷库智能监管 SaaS — 数据库全量 Schema（Step 1 / 可直接初始化）
-- 适配：MySQL 8.0+；utf8mb4；业务时间 DATETIME（按 Asia/Shanghai 约定存储）
--
-- 已合并：`database/migrations/20260517_admin_p1.sql`、`20260517_user_permissions.sql` 中的增量
-- Greenfield：仅执行本文件 + `02_seed.sql` 即可。
-- 存量库仍可使用上述 migration 自旧版 01_schema 升级一次（勿重复合并执行）。
-- =============================================================

CREATE DATABASE IF NOT EXISTS `coldhero`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `coldhero`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- DROP（子表先于父表；不使用外键时仍统一按引用顺序递减）
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `survey_responses`;
DROP TABLE IF EXISTS `surveys`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `generated_reports`;
DROP TABLE IF EXISTS `work_orders`;
DROP TABLE IF EXISTS `technician_status`;
DROP TABLE IF EXISTS `member_expire_reminders`;
DROP TABLE IF EXISTS `fault_reports`;
DROP TABLE IF EXISTS `sensor_history`;
DROP TABLE IF EXISTS `ai_chat_logs`;
DROP TABLE IF EXISTS `user_quotas`;
DROP TABLE IF EXISTS `faq_topics`;
DROP TABLE IF EXISTS `user_zone_bindings`;
DROP TABLE IF EXISTS `zones`;
DROP TABLE IF EXISTS `refresh_tokens`;
DROP TABLE IF EXISTS `user_level_logs`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `regions`;

-- -----------------------------------------------------------------------------
-- 1. 区域（管理员划分；users.region_id / zones 逻辑归属）
-- -----------------------------------------------------------------------------
CREATE TABLE `regions` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `name`        VARCHAR(64) NOT NULL COMMENT '区域名称（唯一）',
  `description` VARCHAR(256) DEFAULT NULL COMMENT '说明',
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='运营区域';

-- -----------------------------------------------------------------------------
-- 2. 用户表（含隐性会员档位；前台 JSON 不包含 member_level）
-- member_level: free / basic / professional / enterprise
-- role: admin=管理端；operator=维修人员等；viewer=客户
-- 超级管理员 / 运维管理员等细分可在后续用独立字段扩展，本期与代码约定一致仅用 admin。
-- -----------------------------------------------------------------------------
CREATE TABLE `users` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `username`       VARCHAR(64)   NOT NULL                COMMENT '登录名（唯一）',
  `email`          VARCHAR(128)  NOT NULL                COMMENT '邮箱（唯一）',
  `password_hash`  VARCHAR(255)  NOT NULL                COMMENT 'bcrypt 哈希',
  `member_level`   ENUM('free','basic','professional','enterprise') NOT NULL DEFAULT 'free' COMMENT '会员档位（仅后台/API 管理端明文）',
  `member_expire_at` DATE DEFAULT NULL COMMENT '会员到期日',
  `phone`          VARCHAR(32)   DEFAULT NULL            COMMENT '手机号（快捷登录预留）',
  `display_name`   VARCHAR(64)   DEFAULT NULL            COMMENT '显示名',
  `avatar_url`     VARCHAR(512)  DEFAULT NULL            COMMENT '头像 URL',
  `role`           ENUM('admin','operator','viewer') NOT NULL DEFAULT 'viewer' COMMENT '系统角色',
  `region_id`      INT DEFAULT NULL COMMENT '隶属区域 regions.id',
  `zone_limit`     INT NOT NULL DEFAULT 1 COMMENT '允许绑定的最大冷库数（-1=不限）',
  `status`         ENUM('active','disabled') NOT NULL DEFAULT 'active' COMMENT '账号状态',
  `last_login_at`  DATETIME      DEFAULT NULL,
  `created_by`     BIGINT UNSIGNED DEFAULT NULL COMMENT '创建该账号的管理员 users.id',
  `notes`          TEXT          DEFAULT NULL COMMENT '管理员备注（不对客户展示）',
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  UNIQUE KEY `uk_email` (`email`),
  KEY `idx_member_level` (`member_level`),
  KEY `idx_region` (`region_id`),
  KEY `idx_member_expire` (`member_expire_at`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户';

-- -----------------------------------------------------------------------------
-- 2b. 会员等级变更日志（管理端）
-- -----------------------------------------------------------------------------
CREATE TABLE `user_level_logs` (
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
-- 3. Refresh Token（双 Token 预留；Redis 可作会话吊销加速）
-- -----------------------------------------------------------------------------
CREATE TABLE `refresh_tokens` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `token_hash` VARBINARY(64)     NOT NULL COMMENT 'SHA-256 等二进制摘要',
  `expires_at` DATETIME          NOT NULL,
  `revoked_at` DATETIME          DEFAULT NULL,
  `created_at` DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_token_hash` (`token_hash`),
  KEY `idx_user_exp` (`user_id`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='refresh token';

-- -----------------------------------------------------------------------------
-- 4. 每日配额兜底表（Redis: quota:{userId}:{date}:{type}）
-- -----------------------------------------------------------------------------
CREATE TABLE `user_quotas` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT UNSIGNED NOT NULL,
  `date`          DATE            NOT NULL COMMENT '配额日（UTC+8）',
  `ai_chat_used`  INT             NOT NULL DEFAULT 0,
  `report_used`   INT             NOT NULL DEFAULT 0,
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_date` (`user_id`, `date`),
  KEY `idx_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户每日配额';

-- -----------------------------------------------------------------------------
-- 5. 冷库 / 库区（≈文档 cold_zones；业务表名沿用 zones）
-- -----------------------------------------------------------------------------
CREATE TABLE `zones` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id`    BIGINT UNSIGNED DEFAULT NULL COMMENT '绑定客户 users.id',
  `code`           VARCHAR(32)  NOT NULL                  COMMENT '库区编码（唯一）',
  `name`           VARCHAR(128) NOT NULL                  COMMENT '库区名称',
  `device_sn`      VARCHAR(64)  DEFAULT NULL               COMMENT '设备序列号',
  `temp_min`       DECIMAL(5,2) NOT NULL DEFAULT -25.00 COMMENT '温控下限℃',
  `temp_max`       DECIMAL(5,2) NOT NULL DEFAULT -18.00 COMMENT '温控上限℃',
  `humidity_min`   DECIMAL(5,2) DEFAULT NULL,
  `humidity_max`   DECIMAL(5,2) DEFAULT NULL,
  `co2_max`        DECIMAL(7,2) DEFAULT NULL COMMENT 'CO₂ 上限 ppm',
  `current_ampere` DECIMAL(6,2) DEFAULT NULL COMMENT '最近一次电流 A（快照维度，可与 sensor_history 并存）',
  `run_minutes`    INT          NOT NULL DEFAULT 0 COMMENT '累计运行时长（分钟，业务写入）',
  `is_online`      TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否在线',
  `last_seen_at`   DATETIME     DEFAULT NULL COMMENT '最近心跳/上报时间',
  `description`    VARCHAR(512) DEFAULT NULL,
  `is_public`      TINYINT      NOT NULL DEFAULT 1 COMMENT '橱窗大屏是否展示',
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_online` (`is_online`),
  KEY `idx_last_seen` (`last_seen_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='冷库库区';

-- -----------------------------------------------------------------------------
-- 5b. 用户 — 冷库绑定（含历史；与 zones.customer_id 并存以便兼容旧逻辑）
-- -----------------------------------------------------------------------------
CREATE TABLE `user_zone_bindings` (
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
-- 6. AI 问答日志 → FAQ 归因来源
-- -----------------------------------------------------------------------------
CREATE TABLE `ai_chat_logs` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT UNSIGNED NOT NULL,
  `session_id`    VARCHAR(64)     NOT NULL,
  `question`      TEXT            NOT NULL,
  `answer`        MEDIUMTEXT      DEFAULT NULL,
  `tokens_in`     INT             DEFAULT NULL,
  `tokens_out`    INT             DEFAULT NULL,
  `latency_ms`    INT             DEFAULT NULL,
  `model`         VARCHAR(64)     DEFAULT NULL,
  `status`        ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
  `error_msg`     VARCHAR(512)    DEFAULT NULL,
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_time` (`user_id`, `created_at`),
  KEY `idx_session`   (`session_id`),
  KEY `idx_created`   (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 问答明细';

CREATE TABLE `faq_topics` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `topic_keyword`    VARCHAR(128) NOT NULL,
  `frequency`        INT          NOT NULL DEFAULT 0,
  `sample_questions` JSON         DEFAULT NULL COMMENT '示例提问 JSON 数组',
  `last_synced_at`   DATETIME     DEFAULT NULL COMMENT '阿里云 DTS/RDS 同步时间',
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_topic` (`topic_keyword`),
  KEY `idx_freq` (`frequency`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='高频 FAQ 归因';

-- -----------------------------------------------------------------------------
-- 7. 传感器历史（高频写入）；含设备电流等与监控大屏一致的字段扩展
-- -----------------------------------------------------------------------------
CREATE TABLE `sensor_history` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `zone_id`       BIGINT UNSIGNED NOT NULL,
  `temperature`   DECIMAL(6,2)    DEFAULT NULL,
  `humidity`      DECIMAL(5,2)    DEFAULT NULL,
  `co2`           DECIMAL(7,2)    DEFAULT NULL,
  `door_status`   ENUM('open','closed','unknown') NOT NULL DEFAULT 'unknown',
  `current_ampere` DECIMAL(6,2)   DEFAULT NULL COMMENT '运行电流（A）',
  `is_anomaly`    TINYINT         NOT NULL DEFAULT 0 COMMENT '是否超阈',
  `recorded_at`   DATETIME        NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_zone_time` (`zone_id`, `recorded_at`),
  KEY `idx_recorded`  (`recorded_at`),
  KEY `idx_anomaly`   (`is_anomaly`, `recorded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='传感器时序';

-- -----------------------------------------------------------------------------
-- 8. 故障报告
-- -----------------------------------------------------------------------------
CREATE TABLE `fault_reports` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT UNSIGNED NOT NULL,
  `zone_id`       BIGINT UNSIGNED DEFAULT NULL,
  `fault_type`    VARCHAR(64)     NOT NULL COMMENT '制冷/电气/门禁/传感器/其他',
  `title`         VARCHAR(255)    NOT NULL,
  `description`   TEXT            NOT NULL,
  `image_urls`    JSON            DEFAULT NULL COMMENT 'OSS 图片 URL',
  `status`        ENUM('pending','processing','closed') NOT NULL DEFAULT 'pending',
  `severity`      ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `ai_analysis`   TEXT            DEFAULT NULL,
  `handler_id`    BIGINT UNSIGNED DEFAULT NULL COMMENT '接单/处理人',
  `handler_note`  TEXT            DEFAULT NULL,
  `closed_at`     DATETIME        DEFAULT NULL,
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_zone` (`zone_id`),
  KEY `idx_status_time` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户故障上报';

-- -----------------------------------------------------------------------------
-- 9. 工单（派单并发；fault_id → fault_reports.id）
-- -----------------------------------------------------------------------------
CREATE TABLE `work_orders` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fault_id`        BIGINT UNSIGNED NOT NULL,
  `assigned_to`     BIGINT UNSIGNED DEFAULT NULL COMMENT '维修人员 users.id',
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
  `result_note`     TEXT DEFAULT NULL COMMENT '结案说明',
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fault` (`fault_id`),
  KEY `idx_tech`  (`assigned_to`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报修工单';

CREATE TABLE `technician_status` (
  `user_id`          BIGINT UNSIGNED NOT NULL COMMENT 'operator 用户 id',
  `is_busy`          TINYINT(1) NOT NULL DEFAULT 0,
  `current_order_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '进行中工单（若忙）',
  `updated_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='维修工派发状态';

-- -----------------------------------------------------------------------------
-- 10. AI 检测报告任务结果
-- -----------------------------------------------------------------------------
CREATE TABLE `generated_reports` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `report_no`      VARCHAR(64)     NOT NULL COMMENT '对外编号（唯一）',
  `report_type`    ENUM('daily','weekly','latest') NOT NULL COMMENT '单日/一周/最近一次异常',
  `time_range`     JSON            NOT NULL COMMENT '{"start":"...","end":"..."}',
  `zone_ids`       JSON            DEFAULT NULL,
  `summary`        TEXT            DEFAULT NULL,
  `content_json`   JSON            DEFAULT NULL COMMENT '结构化内容（PDF/docx 源）',
  `file_url_pdf`   VARCHAR(512)    DEFAULT NULL,
  `file_url_docx`  VARCHAR(512)    DEFAULT NULL,
  `status`         ENUM('queued','processing','done','failed') NOT NULL DEFAULT 'queued',
  `error_msg`      VARCHAR(512)    DEFAULT NULL,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_report_no` (`report_no`),
  KEY `idx_user_time` (`user_id`, `created_at`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 报告生成记录';

-- -----------------------------------------------------------------------------
-- 11. 问卷（questions_json：单选/多选/填空/满意度/附图等均由 JSON 承载）
-- target_levels: null=全员；数组如 ["basic","professional"] 下发指定档位
-- -----------------------------------------------------------------------------
CREATE TABLE `surveys` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`           VARCHAR(255)    NOT NULL,
  `description`     TEXT            DEFAULT NULL,
  `questions_json`  JSON            NOT NULL,
  `target_levels`   JSON            DEFAULT NULL COMMENT '可见会员档位枚举数组，NULL 表示全员',
  `deadline`        DATETIME        DEFAULT NULL COMMENT '截止时间',
  `status`          ENUM('draft','published','closed') NOT NULL DEFAULT 'draft' COMMENT '运营侧「暂停/下架」可先映射为 closed 或后续由独立字段承接',
  `creator_id`      BIGINT UNSIGNED NOT NULL,
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status_deadline` (`status`, `deadline`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='问卷模板';

CREATE TABLE `survey_responses` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `survey_id`    BIGINT UNSIGNED NOT NULL,
  `user_id`      BIGINT UNSIGNED DEFAULT NULL COMMENT '匿名可空',
  `answers_json` JSON            NOT NULL,
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_survey` (`survey_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='问卷作答';

-- -----------------------------------------------------------------------------
-- 12. 站内通知（告警/派单/fault_no_tech/report 就绪等）；短信通道走配置与代码占位
-- -----------------------------------------------------------------------------
CREATE TABLE `notifications` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL COMMENT '0=广播占位（按需业务解释）',
  `type`       VARCHAR(32)     NOT NULL COMMENT 'fault/order/system/report/... ',
  `title`      VARCHAR(255)    NOT NULL,
  `content`    TEXT            DEFAULT NULL,
  `payload`    JSON            DEFAULT NULL,
  `is_read`    TINYINT         NOT NULL DEFAULT 0,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_read_time` (`user_id`, `is_read`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站内信';

-- -----------------------------------------------------------------------------
-- 13. 到期提醒派发记录（防重复 cron）
-- -----------------------------------------------------------------------------
CREATE TABLE `member_expire_reminders` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `remind_days` INT NOT NULL COMMENT '事前第 N 天',
  `expire_at`   DATE NOT NULL,
  `is_sent`     TINYINT(1) NOT NULL DEFAULT 0,
  `sent_at`     DATETIME DEFAULT NULL,
  KEY `idx_user` (`user_id`),
  KEY `idx_expire` (`expire_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会员到期提醒发送记录';

SET FOREIGN_KEY_CHECKS = 1;
