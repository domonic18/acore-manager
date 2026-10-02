import { describe, it, expect } from 'vitest';
import { parseGameRefs } from '@/features/ai-diagnosis/components/GameRefText';

describe('parseGameRefs', () => {
  it('splits text with all four prefixes into link segments', () => {
    const segments = parseGameRefs('核查任务 9312、物品 17、节点 181683 与 NPC 123');
    expect(segments).toEqual([
      { kind: 'text', value: '核查' },
      { kind: 'link', label: '任务 9312', url: 'https://db.nfuwow.com/80/?quest=9312' },
      { kind: 'text', value: '、' },
      { kind: 'link', label: '物品 17', url: 'https://db.nfuwow.com/80/?item=17' },
      { kind: 'text', value: '、' },
      { kind: 'link', label: '节点 181683', url: 'https://db.nfuwow.com/80/?object=181683' },
      { kind: 'text', value: ' 与 ' },
      { kind: 'link', label: 'NPC 123', url: 'https://db.nfuwow.com/80/?npc=123' },
    ]);
  });

  it('maps GameObject prefix to object path and keeps plain text untouched', () => {
    expect(parseGameRefs('GameObject 181683')).toEqual([
      { kind: 'link', label: 'GameObject 181683', url: 'https://db.nfuwow.com/80/?object=181683' },
    ]);
    expect(parseGameRefs('loot 节点竞速、任务越权标记')).toEqual([
      { kind: 'text', value: 'loot 节点竞速、任务越权标记' },
    ]);
  });

  it('does not match digit runs longer than 7', () => {
    expect(parseGameRefs('任务 12345678')).toEqual([{ kind: 'text', value: '任务 12345678' }]);
  });
});
