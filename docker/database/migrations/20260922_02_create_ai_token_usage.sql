-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20260922_02_create_ai_token_usage.sql
-- ai_token_usage：LLM 调用 Token 计量（arch 4.2）
-- 日预算检查：SELECT SUM(total_tokens) WHERE date = today 超阈值 → 飞书告警
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_token_usage (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  scene VARCHAR(20) NOT NULL,
  ref_id VARCHAR(64) NOT NULL,
  model VARCHAR(100) NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_token_usage_date ON ai_token_usage (date);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_scene_ref ON ai_token_usage (scene, ref_id);

COMMENT ON TABLE ai_token_usage IS 'LLM 调用 Token 计量（scene: chat / inspection；ref_id: 会话 id 或巡检任务 id）';
