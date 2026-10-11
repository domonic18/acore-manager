-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20261011_01_create_ai_watchlist.sql
-- ai_watchlist：管理员观察名单（黑/白 × 角色/账号两级），巡检与定向分析注入研判
-- 幂等：CREATE IF NOT EXISTS；黑白互斥（同 realm+对象仅一条记录，切换走编辑）
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_watchlist (
  id SERIAL PRIMARY KEY,
  list_type VARCHAR(10) NOT NULL,
  subject_type VARCHAR(16) NOT NULL,
  subject_name VARCHAR(100) NOT NULL,
  realm VARCHAR(32) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_by VARCHAR(100) NOT NULL DEFAULT 'system',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_ai_watchlist_list_type CHECK (list_type IN ('white', 'black')),
  CONSTRAINT ck_ai_watchlist_subject_type CHECK (subject_type IN ('character', 'account')),
  CONSTRAINT uq_ai_watchlist UNIQUE (realm, subject_type, subject_name)
);

COMMENT ON TABLE ai_watchlist IS '观察名单：管理员维护的黑/白名单（角色+账号两级）——黑名单（其他渠道发现的嫌疑，如聊天提及外挂）检测时重点分析并升档；白名单（作弊概率极低）检出异常时降档；巡检与定向分析任务提示词注入 digest';
COMMENT ON COLUMN ai_watchlist.list_type IS '名单类型：white=白名单（检出异常降风险级）/ black=黑名单（重点分析，severity 至少升一档）';
COMMENT ON COLUMN ai_watchlist.subject_type IS '对象粒度：character=角色级 / account=账号级（账号级命中对其名下全部角色生效）';
COMMENT ON COLUMN ai_watchlist.reason IS '列入理由：黑名单注明嫌疑来源（如聊天渠道发现），白名单注明信任依据；检测报告 suggestion 中引用';

CREATE INDEX IF NOT EXISTS idx_ai_watchlist_realm ON ai_watchlist (realm);

-- owner 步骤（2026-10-08 生产事故教训：超用户建表致 acm 角色无权限 → 页面 500；
-- 本地/生产执行用户均为 acm 时为幂等 no-op）
ALTER TABLE ai_watchlist OWNER TO acm;
ALTER SEQUENCE ai_watchlist_id_seq OWNER TO acm;
