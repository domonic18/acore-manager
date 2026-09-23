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

  it('high latency + aura yields multiple signals and review action', () => {
    const signals = explainSuspect({ ...BASE, latency: { min: 180, max: 260, avg: 230 } }, { auraSpells: [546] });
    expect(signals.map((s) => s.kind).sort()).toEqual(['aura', 'latency']);
    expect(suggestAction(signals)).toBe('review');
  });

  it('empty signals mean investigate', () => {
    expect(suggestAction(explainSuspect(BASE))).toBe('investigate');
  });
});
