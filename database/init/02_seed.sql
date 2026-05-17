-- =============================================================
-- 冷库智能监管平台 - 种子数据（开发/演示用）
-- 默认密码均为：Coldhero@123  （bcrypt 哈希，10 轮）
-- =============================================================

USE `coldhero`;

-- -------------------------------------------------------------
-- 用户：覆盖 4 种会员等级 + 1 个管理员
-- -------------------------------------------------------------
INSERT INTO `users` (`username`, `email`, `password_hash`, `member_level`, `display_name`, `role`) VALUES
  ('admin',     'admin@coldhero.local',     '$2b$10$8K1p/a0dURXAm7Q9jX7kEebI6sB5cE2Y0QjGn7hHj/8m4Rp8tZdGm', 'enterprise', '系统管理员',  'admin'),
  ('demo_free', 'free@coldhero.local',      '$2b$10$8K1p/a0dURXAm7Q9jX7kEebI6sB5cE2Y0QjGn7hHj/8m4Rp8tZdGm', 'free',       '免费用户',    'viewer'),
  ('demo_basic','basic@coldhero.local',     '$2b$10$8K1p/a0dURXAm7Q9jX7kEebI6sB5cE2Y0QjGn7hHj/8m4Rp8tZdGm', 'basic',      '基础用户',    'viewer'),
  ('demo_pro',  'pro@coldhero.local',       '$2b$10$8K1p/a0dURXAm7Q9jX7kEebI6sB5cE2Y0QjGn7hHj/8m4Rp8tZdGm', 'professional','专业用户',    'operator'),
  ('demo_ent',  'enterprise@coldhero.local','$2b$10$8K1p/a0dURXAm7Q9jX7kEebI6sB5cE2Y0QjGn7hHj/8m4Rp8tZdGm', 'enterprise', '企业用户',    'operator');

-- -------------------------------------------------------------
-- 库区：3 个示例库区，覆盖低温/常温/恒温场景
-- -------------------------------------------------------------
INSERT INTO `zones` (`code`, `name`, `temp_min`, `temp_max`, `humidity_min`, `humidity_max`, `co2_max`, `description`, `is_public`) VALUES
  ('A01', 'A 区 - 速冻库',  -25.00, -18.00, 70.00, 90.00, 1000.00, '速冻肉类、海产品存储区',     1),
  ('B01', 'B 区 - 冷藏库',    0.00,   4.00, 75.00, 95.00,  800.00, '果蔬、乳制品冷藏区',         1),
  ('C01', 'C 区 - 恒温库',   12.00,  18.00, 50.00, 70.00,  600.00, '酒类、巧克力等恒温存储区',   0);

-- -------------------------------------------------------------
-- 一份示例问卷（已发布，游客与登录用户均可填写）
-- -------------------------------------------------------------
INSERT INTO `surveys` (`title`, `description`, `questions_json`, `status`, `creator_id`) VALUES
  ('冷库服务满意度调研',
   '请您对本平台服务进行评价，您的反馈将帮助我们持续改进。',
   JSON_ARRAY(
     JSON_OBJECT('id','q1','type','single','title','您对平台的整体满意度？',
       'options', JSON_ARRAY('非常满意','满意','一般','不满意','非常不满意')),
     JSON_OBJECT('id','q2','type','multiple','title','您最常使用哪些功能？',
       'options', JSON_ARRAY('AI 问答','实时温度','故障报告','历史查询','检测报告')),
     JSON_OBJECT('id','q3','type','text','title','您希望我们改进的地方？')
   ),
   'published', 1);
