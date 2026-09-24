import { MOVEMENT_AURA_RULES, matchAuraSpells, rulesForType } from '@/agent/tools/false-positive/aura-rules';

describe('aura-rules', () => {
  it('every rule explains at least one canonical violation type', () => {
    expect(MOVEMENT_AURA_RULES.length).toBeGreaterThanOrEqual(4);
    for (const rule of MOVEMENT_AURA_RULES) {
      expect(rule.explainsTypes.length).toBeGreaterThan(0);
      expect(rule.spells.length).toBeGreaterThan(0);
    }
  });

  it('rulesForType returns only rules explaining that type', () => {
    const speedRules = rulesForType('speed');
    expect(speedRules).toHaveLength(1); // T3.6：十字军光环（骑乘移速）→ speed
    expect(speedRules[0].spells).toEqual(expect.arrayContaining([34859, 32223]));
    const waterwalkRules = rulesForType('waterwalk');
    expect(waterwalkRules.some((r) => r.spells.includes(546))).toBe(true);
  });

  it('crusader aura spell hits the speed rule (T3.6 mounted false-positive sample)', () => {
    const matched = matchAuraSpells([34859]);
    expect(matched).toHaveLength(1);
    expect(matched[0]).toMatchObject({ label: '十字军光环（骑乘移速）', explainsTypes: ['speed'] });
  });

  it('matchAuraSpells hits only present spells and reports them', () => {
    const matched = matchAuraSpells([546, 12345, 33943]);
    expect(matched).toHaveLength(2);
    expect(matched[0]).toMatchObject({ label: '水上行走类光环', spells: [546] });
    expect(matched[1]).toMatchObject({ label: '飞行形态', spells: [33943] });
  });

  it('matchAuraSpells returns empty for unrelated auras', () => {
    expect(matchAuraSpells([12345, 67890])).toEqual([]);
    expect(matchAuraSpells([])).toEqual([]);
  });
});
