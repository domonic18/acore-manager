-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20261003_01_create_patrol_finding.sql
-- patrol_findings：反滥用巡检发现（战场互刷 bg_honor_farm / 硬核被带 hardcore_carry）
-- 幂等：dedupe_key 唯一（类型+当日+排序后对象指纹），重复发现 occurrence_count+1
-- ============================================================

CREATE TABLE IF NOT EXISTS patrol_findings (
  id SERIAL PRIMARY KEY,
  finding_type VARCHAR(32) NOT NULL,
  realm VARCHAR(32) NOT NULL,
  detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  occurrence_count INT NOT NULL DEFAULT 1,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  dedupe_key VARCHAR(160) NOT NULL,
  subjects_json JSONB NOT NULL,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_patrol_findings_dedupe_key UNIQUE (dedupe_key),
  CONSTRAINT ck_patrol_findings_type CHECK (finding_type IN ('bg_honor_farm', 'hardcore_carry')),
  CONSTRAINT ck_patrol_findings_status CHECK (status IN ('open', 'actioned', 'dismissed')),
  CONSTRAINT ck_patrol_findings_occ CHECK (occurrence_count >= 1)
);

CREATE INDEX IF NOT EXISTS idx_patrol_findings_detected_at ON patrol_findings (detected_at);
CREATE INDEX IF NOT EXISTS idx_patrol_findings_type_status ON patrol_findings (finding_type, status);

COMMENT ON TABLE patrol_findings IS '反滥用巡检发现（job 增量扫描写入，GM 处置流转 open/actioned/dismissed）';
COMMENT ON COLUMN patrol_findings.occurrence_count IS '连续命中轮次；首轮=1，≥2 触发飞书告警';
COMMENT ON COLUMN patrol_findings.dedupe_key IS '去重指纹：类型+当日+排序后对象 guid 集合，唯一约束保证幂等';
COMMENT ON COLUMN patrol_findings.subjects_json IS '涉案对象数组 [{accountId, accountName, characterGuid, characterName, level, hardcore, ip, extra}]';
COMMENT ON COLUMN patrol_findings.evidence_json IS '证据明细：战场统计/坐标距离/共现轮次等';
