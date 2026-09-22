-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20260922_05_create_ai_report.sql
-- ai_report：每日诊断报告（arch 4.5）
-- 幂等 upsert 键 UNIQUE(realm, report_date)；重跑覆盖并更新 updated_at
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_report (
  id SERIAL PRIMARY KEY,
  realm VARCHAR(32) NOT NULL,
  report_date DATE NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  health_score INT NOT NULL DEFAULT 0,
  summary VARCHAR(500) NOT NULL DEFAULT '',
  content_json JSONB NOT NULL,
  content_markdown TEXT NOT NULL,
  gm_remark TEXT NULL,
  token_usage JSONB NULL,
  generated_by VARCHAR(20) NOT NULL DEFAULT 'cron',
  status VARCHAR(20) NOT NULL DEFAULT 'ok',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_ai_report_realm_date UNIQUE (realm, report_date),
  CONSTRAINT ck_ai_report_health_score CHECK (health_score >= 0 AND health_score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_ai_report_date ON ai_report (report_date DESC);

COMMENT ON TABLE ai_report IS '每日 AI 诊断报告（content_json 含 suspiciousPlayers / falsePositiveSignals）';
COMMENT ON COLUMN ai_report.gm_remark IS 'GM 处置备注（AI 内容字段不可改）';
