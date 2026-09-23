-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20260921_01_create_ai_model_config.sql
-- ai_model_config：LLM 出口配置（arch 4.1）
-- api_key 经 AES-256-GCM 加密存储，接口不回显明文
-- 注：库本身由 acm-migrate.ts 负责 CREATE DATABASE；
--     updated_at 由应用层（TypeORM UpdateDateColumn）维护，PG 无 ON UPDATE 语法
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_model_config (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  provider VARCHAR(20) NOT NULL DEFAULT 'custom',
  protocol VARCHAR(20) NOT NULL DEFAULT 'openai',
  base_url VARCHAR(500) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  temperature NUMERIC(3,2) NULL,
  max_tokens INT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_tested_at TIMESTAMP NULL,
  last_test_status VARCHAR(20) NULL,
  last_test_error TEXT NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_ai_model_config_name UNIQUE (name)
);

COMMENT ON TABLE ai_model_config IS 'LLM 出口配置（默认出口唯一，设置时清除其他行）';
COMMENT ON COLUMN ai_model_config.api_key_encrypted IS 'AES-256-GCM 密文，接口仅回显掩码';
