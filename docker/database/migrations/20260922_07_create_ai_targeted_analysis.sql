-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20260922_07_create_ai_targeted_analysis.sql
-- ai_targeted_analysis：定向分析结论（arch 4.7）
-- 追加语义：每次发起新增一行，不覆盖历史
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_targeted_analysis (
  id SERIAL PRIMARY KEY,
  realm VARCHAR(32) NOT NULL,
  subject_type VARCHAR(20) NOT NULL,
  subject_name VARCHAR(100) NOT NULL,
  subject_guid INT NULL,
  time_from TIMESTAMP NOT NULL,
  time_to TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  conclusion_json JSONB NULL,
  conclusion_markdown TEXT NULL,
  token_usage JSONB NULL,
  triggered_by VARCHAR(100) NOT NULL,
  gm_remark TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_targeted_analysis_subject ON ai_targeted_analysis (subject_type, subject_name);

COMMENT ON TABLE ai_targeted_analysis IS '账号申诉定向分析（status: running / ok / failed；结论追加不覆盖）';
COMMENT ON COLUMN ai_targeted_analysis.gm_remark IS '申诉处置备注（已回帖 / 已解封 / 已驳回等）';
