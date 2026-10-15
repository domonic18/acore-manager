-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20261015_01_create_feishu_bindings.sql
-- acm_feishu_bindings：飞书免登绑定表（飞书用户 open_id ↔ AC 账号 1:1 映射）
-- 幂等：CREATE IF NOT EXISTS；双向唯一（一个飞书用户只绑一个 AC 账号，一个 AC 账号只接受一个飞书用户）
-- ============================================================

CREATE TABLE IF NOT EXISTS acm_feishu_bindings (
  id SERIAL PRIMARY KEY,
  feishu_open_id VARCHAR(64) NOT NULL,
  feishu_union_id VARCHAR(64) NOT NULL DEFAULT '',
  feishu_name VARCHAR(256) NOT NULL DEFAULT '',
  ac_username VARCHAR(64) NOT NULL,
  created_by VARCHAR(100) NOT NULL DEFAULT 'system',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_acm_feishu_open_id UNIQUE (feishu_open_id),
  CONSTRAINT uq_acm_feishu_ac_username UNIQUE (ac_username)
);

COMMENT ON TABLE acm_feishu_bindings IS '飞书免登绑定：飞书工作台网页应用免登 code 换取的 open_id 与 AzerothCore auth 库账号的映射；登录时 open_id 查到绑定且该账号 gmlevel≥1 才签发 ACM JWT，未绑定一律拒绝（不自动注册）';
COMMENT ON COLUMN acm_feishu_bindings.feishu_open_id IS '飞书用户 open_id（应用内唯一标识，来自 authen/v1/user_info）';
COMMENT ON COLUMN acm_feishu_bindings.feishu_union_id IS '飞书用户 union_id（跨应用标识，便于后续多应用扩展）；绑定时冗余存储';
COMMENT ON COLUMN acm_feishu_bindings.feishu_name IS '飞书用户显示名（绑定时快照，便于绑定管理页人工核对）';
COMMENT ON COLUMN acm_feishu_bindings.ac_username IS '映射的 AzerothCore auth 库账号名（登录实际身份，gmlevel 在登录时实时校验）';

-- owner 步骤（同 ai_watchlist 教训：本地/生产执行用户均为 acm 时为幂等 no-op）
ALTER TABLE acm_feishu_bindings OWNER TO acm;
ALTER SEQUENCE acm_feishu_bindings_id_seq OWNER TO acm;
