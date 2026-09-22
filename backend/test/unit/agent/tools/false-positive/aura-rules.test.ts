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
    expect(speedRules).toHaveLength(0); // 待校准：坐骑移速附魔回填前 speed 无光环解释
    const waterwalkRules = rulesForType('waterwalk');
    expect(waterwalkRules.some((r) => r.spells.includes(546))).toBe(true);
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
