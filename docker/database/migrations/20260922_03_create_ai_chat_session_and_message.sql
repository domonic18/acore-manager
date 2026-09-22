-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20260922_03_create_ai_chat_session_and_message.sql
-- ai_chat_session / ai_chat_message：对话正本（arch 4.3）
-- thread_id 对应 PostgresSaver checkpoint thread；会话删除连带 deleteThread 清理
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_chat_session (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  thread_id VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT '',
  realm VARCHAR(32) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_ai_chat_session_thread UNIQUE (thread_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_session_user ON ai_chat_session (user_id, last_active_at DESC);

CREATE TABLE IF NOT EXISTS ai_chat_message (
  id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES ai_chat_session (id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  tool_name VARCHAR(100) NULL,
  tool_args_json JSONB NULL,
  tokens INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_message_session ON ai_chat_message (session_id, id);

COMMENT ON TABLE ai_chat_session IS 'AI 助手会话（每轮 assistant 回复后异步写正本）';
COMMENT ON TABLE ai_chat_message IS 'AI 助手消息正本（role: user / assistant / tool）';
