-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20260922_06_create_ai_anticheat_exemption.sql
-- ai_anticheat_exemption：误报白名单（arch 4.6）
-- map_id 可空=不限地图；NULLS NOT DISTINCT 确保 (guid, type, NULL) 唯一
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_anticheat_exemption (
  id SERIAL PRIMARY KEY,
  character_guid INT NOT NULL,
  violation_type VARCHAR(50) NOT NULL,
  map_id INT NULL,
  reason VARCHAR(500) NOT NULL,
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_ai_anticheat_exemption UNIQUE NULLS NOT DISTINCT (character_guid, violation_type, map_id)
);

COMMENT ON TABLE ai_anticheat_exemption IS '误报白名单（GM 在报告页标注写入，explain 引擎读取）';
