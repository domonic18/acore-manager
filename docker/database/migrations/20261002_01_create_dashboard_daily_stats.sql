-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20261002_01_create_dashboard_daily_stats.sql
-- dashboard_daily_stats：管理总览运营趋势日快照（job 每日写入 + 一次性回填）
-- 口径：new_accounts/bans 按 auth 库当日计数；active_accounts 仅快照日起可还原
-- （account.last_login 只存最后一次登录，历史置 NULL）；peak_online 由 uptime
-- 会话区间归属到日（会话峰值适用于其覆盖的每一天，跨 realm 求和）
-- ============================================================

CREATE TABLE IF NOT EXISTS dashboard_daily_stats (
  stat_date DATE NOT NULL,
  new_accounts INT NOT NULL DEFAULT 0,
  active_accounts INT NULL,
  peak_online INT NULL,
  bans INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_dashboard_daily_stats PRIMARY KEY (stat_date),
  CONSTRAINT ck_dashboard_daily_stats_nonneg CHECK (new_accounts >= 0 AND bans >= 0)
);

COMMENT ON TABLE dashboard_daily_stats IS '管理总览运营趋势日快照（读多写少，job 每日 upsert）';
COMMENT ON COLUMN dashboard_daily_stats.active_accounts IS '当日登录过的账号数；历史不可还原为 NULL，自快照日起累积';
COMMENT ON COLUMN dashboard_daily_stats.peak_online IS '当日最高在线（uptime 会话峰值按日归属，跨 realm 求和）';
