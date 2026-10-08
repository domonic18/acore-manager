import { buildGameRefUrl, linkifyGameRefs } from '@/agent/tools/db-tools/game-refs';

describe('game-refs', () => {
  it('builds deterministic nfuwow urls (gameobject maps to ?object= path)', () => {
    expect(buildGameRefUrl('quest', 9312)).toBe('https://db.nfuwow.com/80/?quest=9312');
    expect(buildGameRefUrl('item', 17)).toBe('https://db.nfuwow.com/80/?item=17');
    expect(buildGameRefUrl('gameobject', 181683)).toBe('https://db.nfuwow.com/80/?object=181683');
    expect(buildGameRefUrl('npc', 1)).toBe('https://db.nfuwow.com/80/?npc=1');
    expect(buildGameRefUrl('achievement', 6)).toBe('https://db.nfuwow.com/80/?achievement=6');
  });

  it('linkifies the achievement prefix to the achievement path', () => {
    expect(linkifyGameRefs('达成成就 456 后消失')).toBe(
      '达成[成就 456](https://db.nfuwow.com/80/?achievement=456) 后消失',
    );
  });

  it('linkifies all four prefixes followed by an id', () => {
    expect(linkifyGameRefs('核查任务 9312 与物品 17')).toBe(
      '核查[任务 9312](https://db.nfuwow.com/80/?quest=9312) 与[物品 17](https://db.nfuwow.com/80/?item=17)',
    );
    expect(linkifyGameRefs('节点 181683 被重复抢占，NPC 123 附近活动')).toBe(
      '[节点 181683](https://db.nfuwow.com/80/?object=181683) 被重复抢占，' +
        '[NPC 123](https://db.nfuwow.com/80/?npc=123) 附近活动',
    );
    expect(linkifyGameRefs('GameObject 181683')).toBe(
      '[GameObject 181683](https://db.nfuwow.com/80/?object=181683)',
    );
  });

  it('does not match marker words without a following id', () => {
    expect(linkifyGameRefs('server 日志异常标记：loot 节点竞速、任务越权')).toBe(
      'server 日志异常标记：loot 节点竞速、任务越权',
    );
    expect(linkifyGameRefs('任务 未知')).toBe('任务 未知');
  });

  it('does not nest inside existing markdown links', () => {
    const text = '结论见 [任务 9312](https://db.nfuwow.com/80/?quest=9312) 与任务 9473';
    expect(linkifyGameRefs(text)).toBe(
      '结论见 [任务 9312](https://db.nfuwow.com/80/?quest=9312) 与[任务 9473](https://db.nfuwow.com/80/?quest=9473)',
    );
  });

  it('handles # separator and 7-digit ids', () => {
    expect(linkifyGameRefs('物品 #18803')).toBe('[物品 #18803](https://db.nfuwow.com/80/?item=18803)');
    const id7 = '任务 1234567';
    expect(linkifyGameRefs(id7)).toBe(`[任务 1234567](https://db.nfuwow.com/80/?quest=1234567)`);
    expect(linkifyGameRefs('任务 12345678')).toBe('任务 12345678');
  });
});
