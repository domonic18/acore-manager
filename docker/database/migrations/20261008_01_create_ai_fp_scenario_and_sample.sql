-- ============================================================
-- acore-manager / acm 库迁移（PostgreSQL）
-- 20261008_01_create_ai_fp_scenario_and_sample.sql
-- ai_fp_scenario：误报场景库（已知合法传送点/几何误报，explain 引擎 quest 信号数据源）
-- ai_inspection_sample：巡查样本库（goodcase/badcase 标注语料，label 流转 pending→cheat/false_positive）
-- 幂等：两表 CREATE IF NOT EXISTS；种子 ON CONFLICT DO NOTHING（场景库以 (map_id,violation_type,quest_id) 唯一）
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_fp_scenario (
  id SERIAL PRIMARY KEY,
  map_id INT,
  violation_type VARCHAR(50) NOT NULL,
  quest_id INT,
  spots JSONB,
  reason VARCHAR(500) NOT NULL,
  created_by VARCHAR(100) NOT NULL DEFAULT 'system',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_ai_fp_scenario UNIQUE NULLS NOT DISTINCT (map_id, violation_type, quest_id)
);

COMMENT ON TABLE ai_fp_scenario IS '误报场景库：map×violation_type(+quest_id) 维度的已知合法/几何误报场景，spots 为可选传送坐标点（quest 信号强证据），由巡检误报引擎与 UI 管理';
COMMENT ON COLUMN ai_fp_scenario.spots IS '传送坐标点数组 [{x,y,z,radiusYards}]，NULL 表示不限坐标仅按 地图×类型 命中';
COMMENT ON COLUMN ai_fp_scenario.quest_id IS '关联任务 ID（可空），仅用于展示与追溯，命中判定不使用';

CREATE TABLE IF NOT EXISTS ai_inspection_sample (
  id SERIAL PRIMARY KEY,
  realm VARCHAR(32) NOT NULL,
  character_guid INT,
  character_name VARCHAR(100) NOT NULL,
  label VARCHAR(16) NOT NULL,
  source VARCHAR(32) NOT NULL,
  detected_date DATE,
  summary VARCHAR(1000) NOT NULL,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ref_url VARCHAR(500),
  created_by VARCHAR(100) NOT NULL DEFAULT 'system',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_ai_inspection_sample_label CHECK (label IN ('cheat', 'false_positive', 'pending')),
  CONSTRAINT ck_ai_inspection_sample_source CHECK (source IN ('auto_ban', 'appeal', 'deep_analysis', 'inspection', 'gm')),
  CONSTRAINT uq_ai_inspection_sample UNIQUE NULLS NOT DISTINCT (realm, character_name, detected_date)
);

COMMENT ON TABLE ai_inspection_sample IS '巡查样本库：生产确认的作弊/误报标注语料，用于回归评测与提示词校准（元吉穿墙 goodcase、泰瑞丶星陨任务传送 badcase 为首批）';
COMMENT ON COLUMN ai_inspection_sample.label IS '标注：cheat=确认作弊 / false_positive=确认误报 / pending=待定';
COMMENT ON COLUMN ai_inspection_sample.source IS '来源：auto_ban=模块自动封禁 / appeal=申诉结论 / deep_analysis=深度分析 / inspection=巡检 / gm=GM 录入';
COMMENT ON COLUMN ai_inspection_sample.evidence_json IS '证据摘录数组 [{source,quote}]';

CREATE INDEX IF NOT EXISTS idx_ai_inspection_sample_label ON ai_inspection_sample (label);
CREATE INDEX IF NOT EXISTS idx_ai_inspection_sample_detected_date ON ai_inspection_sample (detected_date);

-- 种子：误报场景库（violation_type 须与 anticheat-parser 归一化键逐字一致）
INSERT INTO ai_fp_scenario (map_id, violation_type, quest_id, spots, reason, created_by) VALUES
  (33, 'zaxis', NULL, NULL,
   '影牙城堡内部地面平坦，移动时 Z 轴恒定触发 zaxis 检测（2026-07/09 两起自动误封已证实），计数大小不具作弊含义（自 explain.ts FP_SCENARIOS 迁移）',
   'system'),
  (609, 'teleportplane', 12757,
   '[{"x":2117,"y":-5890,"z":105,"radiusYards":200}]'::jsonb,
   '任务 12757（Scarlet Armies Approach!!!）经天灾传送门法术 53098 把玩家从新阿瓦隆传回悬空的 Acherus，落地瞬间必触发 TeleportPlane 高度检测（模块无服务端传送豁免）——2026-10-02 泰瑞丶星陨 DK 任务误报',
   'system'),
  (609, 'teleportplane', 12801,
   '[{"x":2117,"y":-5890,"z":105,"radiusYards":200}]'::jsonb,
   '任务 12801（The Light of Dawn）光明希望之战结束后返回悬空的 Acherus，同 quest 12757 机制，落地触发 TeleportPlane',
   'system'),
  (0, 'teleportplane', 12801,
   '[{"x":2283,"y":-5320,"z":88,"radiusYards":200}]'::jsonb,
   '任务 12801（The Light of Dawn）开场被传送至圣光希望礼拜堂剧情战场， scripted 传送落在高度异常地形附近',
   'system'),
  (571, 'teleportplane', 12019,
   '[{"x":3733,"y":3563,"z":290,"radiusYards":200},{"x":3802,"y":3585,"z":49,"radiusYards":200},{"x":3687,"y":3577,"z":473,"radiusYards":200}]'::jsonb,
   '任务 12019（Last Rites）区域触发脚本 TeleportTo 三处剧情点（含天穹副本顶与地下段），服务端传送豁免 teleport-hack 但高度跳变可能触发 TeleportPlane',
   'system'),
  (0, 'teleportplane', 13374,
   '[{"x":-8445,"y":337,"z":121,"radiusYards":200}]'::jsonb,
   '幽暗城之战（13374 系）完成时脚本 NearTeleportTo 剧情点，悬空/高度异常地形落地触发 TeleportPlane',
   'system')
ON CONFLICT (map_id, violation_type, quest_id) DO NOTHING;

-- 种子：巡查样本库（首批生产案例语料）
INSERT INTO ai_inspection_sample (realm, character_guid, character_name, label, source, detected_date, summary, evidence_json, ref_url, created_by) VALUES
  ('realm3', NULL, '元吉', 'cheat', 'auto_ban', '2026-10-05',
   '穿墙外挂（带小号 STSM 穿门引 boss）：斯坦索姆 continuous 连续爆发（zaxis 58 + teleportplane 41 + ignorecontrol 4，60 秒内峰值 38 条，双高度层 zUnique=2），延迟仅 10-11ms 排除网络抖动；另有极端超速 +48073%/+829% 与 4 次 Time Manipulation 主动反制记录（变速齿轮强特征）；IP 关联 FIRE 系 4 账号。explain 全空为正确结果。注意：2026-09-30 已出现极端超速记录，当日巡检未入围（已补提示词强制入围规则）',
   '[{"source":"parse_anticheat_violations","quote":"无视 Z 轴 58 条 + 平面传送 41 条 + 无视控制 4 条，continuous 连续爆发模式（60 秒内 38 条），zUnique=2"},{"source":"parse_anticheat_violations","quote":"Speed Movement at 48073.02% above allowed Server Set rate 16.8%"},{"source":"server.log","quote":"ANTICHEAT COUNTER MEASURE:: 元吉 Time Diff Corrected (possible Zero Time Manipulation)"}]'::jsonb,
   'https://lokta.cn/?topic=%E5%B8%A6%E5%B0%8F%E5%8F%B7stsm%E8%A2%AB%E5%B0%81',
   'system'),
  ('realm3', NULL, '泰瑞丶星陨', 'false_positive', 'inspection', '2026-10-02',
   'DK 任务传送误报：玩家完成死亡骑士传送任务（最可能 quest 12757/12801，法术 53098 传送回悬空的 Acherus）触发 teleportplane 记录。AC 源码证实 TeleportPlane 检测无服务端传送豁免（AnticheatMgr.cpp:775-838），悬空建筑落地必触发。单发 teleport/teleportplane 属例行传送（任务/炉石/飞行点），已补 routine 信号与场景库条目',
   '[{"source":"parse_anticheat_violations","quote":"Teleport To Plane 单发命中，坐标位于 Acherus (609) 附近"}]'::jsonb,
   NULL,
   'system')
ON CONFLICT (realm, character_name, detected_date) DO NOTHING;
