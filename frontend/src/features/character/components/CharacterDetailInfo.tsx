import { InfoCard, InfoRow } from '@/shared/components/InfoCard';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { raceMap, classMap } from '@/shared/constants/game.constants';
import { formatGold } from '@/shared/utils/gold.util';
import type { CharacterDetail } from '@/features/character/api/character.api';

export function CharacterDetailInfo({ character }: { character: CharacterDetail }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <InfoCard title="基本信息">
        <InfoRow label="GUID" value={character.guid} />
        <InfoRow label="名称" value={character.name} />
        <InfoRow label="等级" value={character.level} />
        <InfoRow label="种族" value={raceMap[character.race] || '未知'} />
        <InfoRow label="职业" value={classMap[character.class] || '未知'} />
        <InfoRow
          label="状态"
          value={character.online ? <StatusBadge tone="green">在线</StatusBadge> : '离线'}
        />
        <InfoRow label="所属账号" value={character.accountUsername} />
      </InfoCard>

      <InfoCard title="属性与进度">
        <InfoRow label="经验值" value={character.xp.toLocaleString()} />
        <InfoRow label="金币" value={formatGold(character.money)} />
        <InfoRow label="竞技场点数" value={character.arenaPoints} />
        <InfoRow label="荣誉点数" value={character.totalHonorPoints} />
        <InfoRow label="总击杀数" value={character.totalKills} />
        <InfoRow
          label="总在线时长"
          value={`${Math.floor(character.totalTime / 3600)} 小时`}
        />
      </InfoCard>
    </div>
  );
}
