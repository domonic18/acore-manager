export const raceMap: Record<number, string> = {
  1: '人类', 2: '兽人', 3: '矮人', 4: '暗夜精灵', 5: '亡灵',
  6: '牛头人', 7: '侏儒', 8: '巨魔', 9: '地精', 10: '血精灵',
  11: '德莱尼', 22: '狼人',
};

export const classMap: Record<number, string> = {
  1: '战士', 2: '圣骑士', 3: '猎人', 4: '潜行者', 5: '牧师',
  6: '死亡骑士', 7: '萨满', 8: '法师', 9: '术士', 11: '德鲁伊',
};

export const banReasonOptions = [
  { value: '违规', label: '违规' },
  { value: '使用外挂/作弊', label: '使用外挂/作弊' },
  { value: '恶意刷屏', label: '恶意刷屏' },
  { value: '辱骂他人', label: '辱骂他人' },
  { value: '欺诈/诈骗', label: '欺诈/诈骗' },
  { value: '恶意利用BUG', label: '恶意利用BUG' },
  { value: '__custom__', label: '其他（手动输入）' },
];

export const durationLabels: Record<string, string> = {
  '1h': '1小时',
  '1d': '1天',
  '7d': '7天',
  '30d': '30天',
  '-1': '永久',
};
