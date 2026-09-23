-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20260922_04_create_ai_tool_audit.sql
-- ai_tool_audit：工具调用审计（arch 4.4）
-- 巡检与对话共用；报告页"证据链回放"按 ref_id 读取
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_tool_audit (
  id SERIAL PRIMARY KEY,
  ref_id VARCHAR(64) NOT NULL,
  tool_name VARCHAR(100) NOT NULL,
  args_json JSONB NULL,
  row_count INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ok',
  error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_audit_ref ON ai_tool_audit (ref_id, id);

COMMENT ON TABLE ai_tool_audit IS '白名单工具调用审计（status: ok / error / budget_exceeded）';
