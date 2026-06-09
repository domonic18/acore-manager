export const RACE_MAP: Record<number, { name: string; color: string }> = {
  1: { name: '人类', color: '#f1c40f' },
  2: { name: '兽人', color: '#27ae60' },
  3: { name: '矮人', color: '#3498db' },
  4: { name: '暗夜精灵', color: '#8e44ad' },
  5: { name: '亡灵', color: '#2c3e50' },
  6: { name: '牛头人', color: '#d35400' },
  7: { name: '侏儒', color: '#e74c3c' },
  8: { name: '巨魔', color: '#16a085' },
  10: { name: '血精灵', color: '#c0392b' },
  11: { name: '德莱尼', color: '#2980b9' },
};

export const CLASS_MAP: Record<number, { name: string; color: string }> = {
  1: { name: '战士', color: '#c79c6e' },
  2: { name: '圣骑士', color: '#f58cba' },
  3: { name: '猎人', color: '#abd473' },
  4: { name: '潜行者', color: '#fff569' },
  5: { name: '牧师', color: '#ffffff' },
  6: { name: '死亡骑士', color: '#c41f3b' },
  7: { name: '萨满', color: '#0070de' },
  8: { name: '法师', color: '#69ccf0' },
  9: { name: '术士', color: '#9482c9' },
  11: { name: '德鲁伊', color: '#ff7d0a' },
};

const RACE_ICON_MAP: Record<number, { male: string; female: string }> = {
  1: { male: 'Ui-charactercreate-races_human-male.png', female: 'Ui-charactercreate-races_human-female.png' },
  2: { male: 'Ui-charactercreate-races_orc-male.png', female: 'Ui-charactercreate-races_orc-female.png' },
  3: { male: 'Ui-charactercreate-races_dwarf-male.png', female: 'Ui-charactercreate-races_dwarf-female.png' },
  4: { male: 'Ui-charactercreate-races_nightelf-male.png', female: 'Ui-charactercreate-races_nightelf-female.png' },
  5: { male: 'Ui-charactercreate-races_undead-male.png', female: 'Ui-charactercreate-races_undead-female.png' },
  6: { male: 'Ui-charactercreate-races_tauren-male.png', female: 'Ui-charactercreate-races_tauren-female.png' },
  7: { male: 'Ui-charactercreate-races_gnome-male.png', female: 'Ui-charactercreate-races_gnome-female.png' },
  8: { male: 'Ui-charactercreate-races_troll-male.png', female: 'Ui-charactercreate-races_troll-female.png' },
  10: { male: 'Ui-charactercreate-races_bloodelf-male.png', female: 'Ui-charactercreate-races_bloodelf-female.png' },
  11: { male: 'Ui-charactercreate-races_draenei-male.png', female: 'Ui-charactercreate-races_draenei-female.png' },
};

export function getRaceIconUrl(raceId: number, gender: number = 0): string {
  const data = RACE_ICON_MAP[raceId];
  if (!data) return '';
  const fileName = gender === 1 ? data.female : data.male;
  return `/assets/icons/race/${fileName}`;
}

export function getClassIconUrl(classId: number): string {
  return `/assets/icons/class/hd${classId}.png`;
}
