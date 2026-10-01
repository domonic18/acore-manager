import { explainSuspect, suggestAction } from '@/agent/tools/false-positive/explain';

const BASE = { guid: 11318, player: '灭团之星', type: 'waterwalk', mapId: 530, latency: { min: 20, max: 40, avg: 30 } };

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
    const sfk = explainSuspect({ ...BASE, type: 'zaxis', mapId: 33 });
    expect(sfk.filter((s) => s.kind === 'map')).toHaveLength(1);
    expect(sfk[0].detail).toContain('影牙城堡');
    expect(suggestAction(sfk)).toBe('warning');

    // 同地图其他类型不命中场景库（避免一刀切放行同地图真作弊）
    expect(explainSuspect({ ...BASE, mapId: 33 }).filter((s) => s.kind === 'map')).toHaveLength(0);
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
    const signals = explainSuspect({ ...BASE, type: 'zaxis', mapId: 33, pattern: 'continuous' });
    expect(signals.map((s) => s.kind)).toEqual(['map']);
  });
});
