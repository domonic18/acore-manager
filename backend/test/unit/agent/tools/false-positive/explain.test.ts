import { explainSuspect, FpScenarioRule, suggestAction } from '@/agent/tools/false-positive/explain';

const BASE = { guid: 11318, player: '灭团之星', type: 'waterwalk', mapId: 530, latency: { min: 20, max: 40, avg: 30 } };

// map33 条目已自 FP_SCENARIOS 硬编码迁移至 acm.ai_fp_scenario（无 spots 按 地图×类型 命中）
const SHADOWFANG: FpScenarioRule = {
  mapId: 33,
  violationType: 'zaxis',
  questId: null,
  reason: '影牙城堡内部地面平坦，移动时 Z 轴恒定触发 zaxis 检测（2026-07/09 两起自动误封已证实），计数大小不具作弊含义',
};

describe('explainSuspect', () => {
  it('produces an aura signal when a matching movement aura is present', () => {
    const signals = explainSuspect(BASE, { auraSpells: [546] });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: 'aura' });
    expect(signals[0].detail).toContain('水上行走类光环');
    expect(signals[0].detail).toContain('546');
  });

  it('ignores auras that do not explain the suspect type', () => {
    // 飞行形态不解释 waterwalk
    expect(explainSuspect(BASE, { auraSpells: [33943] })).toEqual([]);
  });

  it('produces an exemption signal with mapId null wildcard but not a mismatched map', () => {
    const withAllMap = explainSuspect(BASE, {
      exemptions: [{ characterGuid: 11318, violationType: 'waterwalk', mapId: null, reason: '已知水面贴图误判' }],
    });
    expect(withAllMap).toEqual([{ kind: 'exemption', detail: 'GM 白名单：已知水面贴图误判' }]);

    const otherMap = explainSuspect(BASE, {
      exemptions: [{ characterGuid: 11318, violationType: 'waterwalk', mapId: 0, reason: 'x' }],
    });
    expect(otherMap).toEqual([]);
  });

  it('ignores exemptions for other guid or type', () => {
    const signals = explainSuspect(BASE, {
      exemptions: [
        { characterGuid: 999, violationType: 'waterwalk', mapId: null, reason: 'a' },
        { characterGuid: 11318, violationType: 'speed', mapId: null, reason: 'b' },
      ],
    });
    expect(signals).toEqual([]);
  });

  it('flags high average latency', () => {
    const signals = explainSuspect({ ...BASE, latency: { min: 180, max: 260, avg: 230 } });
    expect(signals.filter((s) => s.kind === 'latency')).toHaveLength(1);
  });

  it('high latency + aura yields multiple signals and warning action', () => {
    const signals = explainSuspect({ ...BASE, latency: { min: 180, max: 260, avg: 230 } }, { auraSpells: [546] });
    expect(signals.map((s) => s.kind).sort()).toEqual(['aura', 'latency']);
    expect(suggestAction(signals)).toBe('warning');
  });

  it('empty signals mean investigate', () => {
    expect(suggestAction(explainSuspect(BASE))).toBe('investigate');
  });

  it('fires the map33×zaxis false-ban scenario but not other types on the same map', () => {
    const sfk = explainSuspect({ ...BASE, type: 'zaxis', mapId: 33 }, { scenarios: [SHADOWFANG] });
    expect(sfk.filter((s) => s.kind === 'map')).toHaveLength(1);
    expect(sfk[0].detail).toContain('影牙城堡');
    expect(suggestAction(sfk)).toBe('warning');

    // 同地图其他类型不命中场景库（避免一刀切放行同地图真作弊）
    expect(explainSuspect({ ...BASE, mapId: 33 }, { scenarios: [SHADOWFANG] }).filter((s) => s.kind === 'map')).toHaveLength(0);
  });

  it('fires the quest signal only when a position falls inside a scenario spot radius', () => {
    const acherus: FpScenarioRule = {
      mapId: 609,
      violationType: 'teleportplane',
      questId: 12757,
      spots: [{ x: 2117, y: -5890, z: 105, radiusYards: 200 }],
      reason: '任务 12757 经天灾传送门传回悬空的 Acherus，落地触发 TeleportPlane',
    };
    const hit = explainSuspect(
      { ...BASE, type: 'teleportplane', mapId: 609, positions: [{ x: 2150, y: -5800, z: 100 }] },
      { scenarios: [acherus] },
    );
    expect(hit.filter((s) => s.kind === 'quest')).toHaveLength(1);
    expect(hit.find((s) => s.kind === 'quest')?.detail).toContain('12757');
    expect(suggestAction(hit)).toBe('warning');

    // 半径外（>200 码）不命中
    const miss = explainSuspect(
      { ...BASE, type: 'teleportplane', mapId: 609, positions: [{ x: 2117, y: -5600, z: 105 }] },
      { scenarios: [acherus] },
    );
    expect(miss.filter((s) => s.kind === 'quest')).toHaveLength(0);

    // 命中条目带 spots 但聚合无坐标采样时不标注（保守降级）
    const noPos = explainSuspect({ ...BASE, type: 'teleportplane', mapId: 609 }, { scenarios: [acherus] });
    expect(noPos.filter((s) => s.kind === 'quest')).toHaveLength(0);
  });

  it('routinizes sparse single teleport events (quest/hearth/flightpath) as a strong signal', () => {
    // 泰瑞丶星陨案：单发 teleportplane，任务传送误报
    const sparse = explainSuspect({
      ...BASE,
      type: 'teleportplane',
      count: 4,
      pattern: 'single',
      interval: { minGapSec: 0, medianGapSec: 0, burst60s: 1 },
    });
    expect(sparse.map((s) => s.kind)).toEqual(['routine']);
    expect(suggestAction(sparse)).toBe('warning');

    // 阈值边界：count=6 不再例行化（回落 weak pattern 信号）
    const overCount = explainSuspect({
      ...BASE,
      type: 'teleportplane',
      count: 6,
      pattern: 'single',
      interval: { minGapSec: 0, medianGapSec: 0, burst60s: 1 },
    });
    expect(overCount.map((s) => s.kind)).toEqual(['pattern']);

    // burst 超阈值（60s 峰值 4 条）不例行化；pulsed 形态本就不触发 weak pattern 信号 → 无信号走 investigate
    const burst = explainSuspect({
      ...BASE,
      type: 'teleport',
      count: 5,
      pattern: 'pulsed',
      interval: { minGapSec: 1, medianGapSec: 5, burst60s: 4 },
    });
    expect(burst).toEqual([]);
  });

  it('never routinizes continuous teleport bursts (wallhack pattern like the 元吉 case)', () => {
    const wallhack = explainSuspect({
      ...BASE,
      type: 'teleportplane',
      count: 41,
      pattern: 'continuous',
      interval: { minGapSec: 0, medianGapSec: 4, burst60s: 38 },
    });
    expect(wallhack).toEqual([]);
    expect(suggestAction(wallhack)).toBe('investigate');
  });

  it('does not flag extreme speed magnitudes as mount inertia', () => {
    // 元吉案 9-30：+48073% 属瞬移型强作弊特征，magnitude 档位跳变信号不适用
    const extreme = explainSuspect({
      ...BASE,
      type: 'speed',
      magnitude: { min: 829, median: 48073, max: 48073 },
      allowedRates: [16.8],
      pattern: 'single',
      interval: { minGapSec: 0, medianGapSec: 0, burst60s: 1 },
    });
    expect(extreme).toEqual([]);
    expect(suggestAction(extreme)).toBe('investigate');
  });

  it('flags speed magnitude tier-jump only in non-continuous patterns', () => {
    // 坐骑状态切换惯性：中位 +100%（一个档位跳变）且 pulsed
    const mountInertia = explainSuspect({
      ...BASE,
      type: 'speed',
      magnitude: { min: 100, median: 100, max: 104 },
      allowedRates: [7],
      pattern: 'pulsed',
      interval: { minGapSec: 60, medianGapSec: 132, burst60s: 2 },
    });
    expect(mountInertia.filter((s) => s.kind === 'magnitude')).toHaveLength(1);
    expect(mountInertia.filter((s) => s.kind === 'pattern')).toHaveLength(1);
    expect(suggestAction(mountInertia)).toBe('warning');

    // 连续形态的 +100% 更可能是真实加速，不标注
    const continuous = explainSuspect({
      ...BASE,
      type: 'speed',
      magnitude: { min: 96, median: 100, max: 110 },
      pattern: 'continuous',
      interval: { minGapSec: 0, medianGapSec: 20, burst60s: 9 },
    });
    expect(continuous.filter((s) => s.kind === 'magnitude' || s.kind === 'pattern')).toHaveLength(0);
    expect(suggestAction(continuous)).toBe('investigate');
  });

  it('flags single teleport as lacking continuity evidence', () => {
    const single = explainSuspect({ ...BASE, type: 'teleportplane', pattern: 'single' });
    expect(single.map((s) => s.kind)).toEqual(['pattern']);
    // 连续多次坐标跳变不标注
    expect(explainSuspect({ ...BASE, type: 'teleportplane', pattern: 'continuous' })).toEqual([]);
  });

  it('does not apply pattern signal to geometry-driven zaxis type', () => {
    // 影牙案例 2：8 分钟 260 条 zaxis 也是误封——zaxis 计数/形态不具判据意义
    const signals = explainSuspect({ ...BASE, type: 'zaxis', mapId: 33, pattern: 'continuous' }, { scenarios: [SHADOWFANG] });
    expect(signals.map((s) => s.kind)).toEqual(['map']);
  });
});
