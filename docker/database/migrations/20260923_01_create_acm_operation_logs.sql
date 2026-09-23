-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20260923_01_create_acm_operation_logs.sql
-- acm_operation_logs：GM 操作审计日志（数据库操作规范.md 例外表）
-- 自 acore_auth（MySQL）迁入 acm（PostgreSQL），与系统自有库统一；
-- audit-log.repository 已同步改为走 acmDataSource。
-- ============================================================

CREATE TABLE IF NOT EXISTS acm_operation_logs (
  id SERIAL PRIMARY KEY,
  operator_id INT NOT NULL DEFAULT 0,
  operator_name VARCHAR(64) NOT NULL DEFAULT '',
  operation VARCHAR(64) NOT NULL,
  target VARCHAR(128) NOT NULL DEFAULT '',
  details TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_acm_operation_logs_operation ON acm_operation_logs (operation);
CREATE INDEX IF NOT EXISTS idx_acm_operation_logs_created ON acm_operation_logs (created_at);

COMMENT ON TABLE acm_operation_logs IS 'ACM GM 操作审计日志（自 acore_auth 迁入；迁移前数据见下方生产拷贝语句）';

-- 生产切换一次性历史数据拷贝（先在 MySQL 侧导出，再在 acm PG 执行）：
-- INSERT INTO acm_operation_logs (operator_id, operator_name, operation, target, details, created_at)
-- SELECT operator_id, operator_name, operation, target, details, created_at
--   FROM acore_auth.acm_operation_logs;  -- MySQL 导出后按目标库方言导入
