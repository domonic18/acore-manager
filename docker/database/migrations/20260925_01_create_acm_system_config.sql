-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20260925_01_create_acm_system_config.sql
-- acm_system_config：系统级配置（KV）
-- 承载默认 realm 名、SOAP 连接配置（password 为 AES-256-GCM 密文），
-- 取代代码硬编码 realm3 与 SOAP_URL 环境变量（后者保留作回落）。
-- ============================================================

CREATE TABLE IF NOT EXISTS acm_system_config (
  config_key VARCHAR(64) PRIMARY KEY,
  config_value TEXT NOT NULL,
  is_secret BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by VARCHAR(64) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE acm_system_config IS 'ACM 系统配置（KV）：default_realm / soap_host / soap_port / soap_username / soap_password（is_secret=true 时 value 为 AES-256-GCM 密文）';
