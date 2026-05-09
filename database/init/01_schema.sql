-- =============================================================
-- 冷库智能监管平台 - 数据库 Schema
-- 适配：MySQL 8.0+；字符集 utf8mb4；时区 Asia/Shanghai
-- 注意：所有时间字段默认 UTC+8，前后端统一存储 DATETIME（不带时区）
-- =============================================================

CREATE DATABASE IF NOT EXISTS `coldhero`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `coldhero`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -------------------------------------------------------------
-- 1. 用户表（含会员等级）
-- member_level: free / basic / pro / enterprise
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `username`       VARCHAR(64)  NOT NULL                COMMENT '用户名（唯一）',
  `email`          VARCHAR(128) NOT NULL                COMMENT '邮箱（唯一）',
  `password_hash`  VARCHAR(255) NOT NULL                COMMENT 'bcrypt 密码哈希',
  `member_level`   ENUM('free','basic','pro','enterprise') NOT NULL DEFAULT 'free' COMMENT '会员等级',
  `phone`          VARCHAR(32)  DEFAULT NULL            COMMENT '手机号（可空）',
  `display_name`   VARCHAR(64)  DEFAULT NULL            COMMENT '显示昵称',
  `avatar_url`     VARCHAR(512) DEFAULT NULL            COMMENT '头像地址',
  `role`           ENUM('admin','operator','viewer') NOT NULL DEFAULT 'viewer' COMMENT '系统角色：管理员/运维/访客',
  `status`         TINYINT      NOT NULL DEFAULT 1     COMMENT '1=正常 0=禁用',
  `last_login_at`  DATETIME     DEFAULT NULL            COMMENT '最近一次登录时间',
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  UNIQUE KEY `uk_email` (`email`),
  KEY `idx_member_level` (`member_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- -------------------------------------------------------------
-- 2. 配额记录表（每日计数；Redis 是热数据，本表为持久化兜底）
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `user_quotas`;
CREATE TABLE `user_quotas` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT UNSIGNED NOT NULL                COMMENT '用户 ID',
  `date`          DATE            NOT NULL                COMMENT '配额所属日期（UTC+8）',
  `ai_chat_used`  INT             NOT NULL DEFAULT 0      COMMENT '当日 AI 问答已使用次数',
  `report_used`   INT             NOT NULL DEFAULT 0      COMMENT '当日报告生成已使用份数',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_date` (`user_id`, `date`),
  KEY `idx_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户每日配额使用记录';

-- -------------------------------------------------------------
-- 3. 库区表（多租户/多库区支持）
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `zones`;
CREATE TABLE `zones` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`          VARCHAR(32)  NOT NULL                  COMMENT '库区编码（业务唯一）',
  `name`          VARCHAR(128) NOT NULL                  COMMENT '库区名称',
  `temp_min`      DECIMAL(5,2) NOT NULL DEFAULT -25.00   COMMENT '温度下限（℃）',
  `temp_max`      DECIMAL(5,2) NOT NULL DEFAULT -18.00   COMMENT '温度上限（℃）',
  `humidity_min`  DECIMAL(5,2) DEFAULT NULL              COMMENT '湿度下限（%）',
  `humidity_max`  DECIMAL(5,2) DEFAULT NULL              COMMENT '湿度上限（%）',
  `co2_max`       DECIMAL(7,2) DEFAULT NULL              COMMENT 'CO₂ 上限（ppm）',
  `description`   VARCHAR(512) DEFAULT NULL              COMMENT '描述',
  `is_public`     TINYINT      NOT NULL DEFAULT 1        COMMENT '是否在橱窗页公开 1=是 0=否',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库区/冷库分区表';

-- -------------------------------------------------------------
-- 4. AI 问答记录表（高频问题归因来源）
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `ai_chat_logs`;
CREATE TABLE `ai_chat_logs` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT UNSIGNED NOT NULL                COMMENT '用户 ID',
  `session_id`    VARCHAR(64)     NOT NULL                COMMENT '会话 ID（前端生成的 uuid）',
  `question`      TEXT            NOT NULL                COMMENT '用户提问',
  `answer`        MEDIUMTEXT      DEFAULT NULL            COMMENT 'AI 回复（异步写入）',
  `tokens_in`     INT             DEFAULT NULL            COMMENT '输入 token 数',
  `tokens_out`    INT             DEFAULT NULL            COMMENT '输出 token 数',
  `latency_ms`    INT             DEFAULT NULL            COMMENT '耗时（毫秒）',
  `model`         VARCHAR(64)     DEFAULT NULL            COMMENT '使用的模型名',
  `status`        ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
  `error_msg`     VARCHAR(512)    DEFAULT NULL,
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_time` (`user_id`, `created_at`),
  KEY `idx_session`   (`session_id`),
  KEY `idx_created`   (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 问答日志';

-- -------------------------------------------------------------
-- 5. 高频问题归因表（每日定时任务从 ai_chat_logs 聚合）
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `faq_topics`;
CREATE TABLE `faq_topics` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `topic_keyword`    VARCHAR(128) NOT NULL                COMMENT '关键词 / 主题',
  `frequency`        INT          NOT NULL DEFAULT 0      COMMENT '出现频次（近 7 天）',
  `sample_questions` JSON         DEFAULT NULL            COMMENT '示例提问（JSON 数组，最多 5 条）',
  `last_synced_at`   DATETIME     DEFAULT NULL            COMMENT '最近一次同步至阿里云 RDS 时间',
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_topic` (`topic_keyword`),
  KEY `idx_freq` (`frequency`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='高频问题归因表';

-- -------------------------------------------------------------
-- 6. 传感器历史数据表（高频写入，按月分区可后续优化）
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `sensor_history`;
CREATE TABLE `sensor_history` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `zone_id`       BIGINT UNSIGNED NOT NULL                COMMENT '库区 ID',
  `temperature`   DECIMAL(6,2)    DEFAULT NULL            COMMENT '温度 ℃',
  `humidity`      DECIMAL(5,2)    DEFAULT NULL            COMMENT '湿度 %',
  `co2`           DECIMAL(7,2)    DEFAULT NULL            COMMENT 'CO₂ ppm',
  `door_status`   ENUM('open','closed','unknown') NOT NULL DEFAULT 'unknown' COMMENT '门状态',
  `is_anomaly`    TINYINT         NOT NULL DEFAULT 0      COMMENT '是否异常 1=是 0=否',
  `recorded_at`   DATETIME        NOT NULL                COMMENT '采集时间',
  PRIMARY KEY (`id`),
  KEY `idx_zone_time` (`zone_id`, `recorded_at`),
  KEY `idx_recorded`  (`recorded_at`),
  KEY `idx_anomaly`   (`is_anomaly`, `recorded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='传感器历史数据';

-- -------------------------------------------------------------
-- 7. 故障报告表
-- status: pending / processing / closed
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `fault_reports`;
CREATE TABLE `fault_reports` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT UNSIGNED NOT NULL                COMMENT '提交用户 ID',
  `zone_id`       BIGINT UNSIGNED DEFAULT NULL            COMMENT '关联库区 ID',
  `fault_type`    VARCHAR(64)     NOT NULL                COMMENT '故障类型（制冷/电气/门禁/传感器/其他）',
  `title`         VARCHAR(255)    NOT NULL                COMMENT '故障标题',
  `description`   TEXT            NOT NULL                COMMENT '详细描述',
  `image_urls`    JSON            DEFAULT NULL            COMMENT '图片 URL 列表（OSS）',
  `status`        ENUM('pending','processing','closed') NOT NULL DEFAULT 'pending',
  `severity`      ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `ai_analysis`   TEXT            DEFAULT NULL            COMMENT 'AI 初步分析结果',
  `handler_id`    BIGINT UNSIGNED DEFAULT NULL            COMMENT '处理人用户 ID',
  `handler_note`  TEXT            DEFAULT NULL            COMMENT '维修人员处理意见',
  `closed_at`     DATETIME        DEFAULT NULL            COMMENT '关闭时间',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user`        (`user_id`),
  KEY `idx_zone`        (`zone_id`),
  KEY `idx_status_time` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='故障报告表';

-- -------------------------------------------------------------
-- 8. 已生成的 AI 检测报告记录表
-- report_type: daily / weekly / latest
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `generated_reports`;
CREATE TABLE `generated_reports` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        BIGINT UNSIGNED NOT NULL                COMMENT '生成用户 ID',
  `report_no`      VARCHAR(64)     NOT NULL                COMMENT '报告编号（业务唯一）',
  `report_type`    ENUM('daily','weekly','latest') NOT NULL COMMENT '报告类型',
  `time_range`     JSON            NOT NULL                COMMENT '时间范围 {start, end}',
  `zone_ids`       JSON            DEFAULT NULL            COMMENT '关联库区 ID 列表',
  `summary`        TEXT            DEFAULT NULL            COMMENT '报告摘要',
  `content_json`   JSON            DEFAULT NULL            COMMENT '报告结构化内容（生成 PDF/Word 的源数据）',
  `file_url_pdf`   VARCHAR(512)    DEFAULT NULL            COMMENT 'PDF 文件 URL',
  `file_url_docx`  VARCHAR(512)    DEFAULT NULL            COMMENT 'Word 文件 URL',
  `status`         ENUM('queued','processing','done','failed') NOT NULL DEFAULT 'queued',
  `error_msg`      VARCHAR(512)    DEFAULT NULL,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_report_no` (`report_no`),
  KEY `idx_user_time` (`user_id`, `created_at`),
  KEY `idx_status`    (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 检测报告记录';

-- -------------------------------------------------------------
-- 9. 问卷与问卷答卷
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `surveys`;
CREATE TABLE `surveys` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`          VARCHAR(255)    NOT NULL                COMMENT '问卷标题',
  `description`    TEXT            DEFAULT NULL,
  `questions_json` JSON            NOT NULL                COMMENT '题目结构（JSON 数组：text/single/multiple）',
  `status`         ENUM('draft','published','closed') NOT NULL DEFAULT 'draft',
  `creator_id`     BIGINT UNSIGNED NOT NULL                COMMENT '创建人',
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='问卷表';

DROP TABLE IF EXISTS `survey_responses`;
CREATE TABLE `survey_responses` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `survey_id`    BIGINT UNSIGNED NOT NULL                COMMENT '问卷 ID',
  `user_id`      BIGINT UNSIGNED DEFAULT NULL            COMMENT '答题人（可匿名 NULL）',
  `answers_json` JSON            NOT NULL                COMMENT '答案 JSON（与题目结构对应）',
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_survey` (`survey_id`),
  KEY `idx_user`   (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='问卷答卷';

-- -------------------------------------------------------------
-- 10. 站内消息通知（异常告警 / 系统消息）
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL                COMMENT '接收者；0 表示广播',
  `type`       VARCHAR(32)     NOT NULL                COMMENT 'alert / fault / system / report',
  `title`      VARCHAR(255)    NOT NULL,
  `content`    TEXT            DEFAULT NULL,
  `payload`    JSON            DEFAULT NULL            COMMENT '附加 JSON 数据',
  `is_read`    TINYINT         NOT NULL DEFAULT 0,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_read_time` (`user_id`, `is_read`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内消息通知';

SET FOREIGN_KEY_CHECKS = 1;
