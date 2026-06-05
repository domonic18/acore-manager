import { useParams, useNavigate } from 'react-router-dom';
import { useCharacterDetail } from '@/features/character/hooks/useCharacter';

const raceMap: Record<number, string> = {
  1: '人类', 2: '兽人', 3: '矮人', 4: '暗夜精灵', 5: '亡灵',
  6: '牛头人', 7: '侏儒', 8: '巨魔', 9: '地精', 10: '血精灵',
  11: '德莱尼', 22: '狼人',
};

const classMap: Record<number, string> = {
  1: '战士', 2: '圣骑士', 3: '猎人', 4: '潜行者', 5: '牧师',
  6: '死亡骑士', 7: '萨满', 8: '法师', 9: '术士', 11: '德鲁伊',
};

export default function CharacterDetailPage() {
  const { guid } = useParams<{ guid: string }>();
  const navigate = useNavigate();
  const characterGuid = parseInt(guid || '0');
  const { data: character, isLoading } = useCharacterDetail(characterGuid);

  if (isLoading) {
    return (
      
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      
    );
  }

  if (!character) {
    return (
      
        <div className="text-center py-12 text-muted-foreground">角色不存在</div>
      
    );
  }

  const gold = Math.floor(character.money / 10000);
  const silver = Math.floor((character.money % 10000) / 100);
  const copper = character.money % 100;

  return (
    
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/characters')}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← 返回列表
          </button>
        </div>

        <h1 className="text-2xl font-bold">{character.name}</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoCard title="基本信息">
            <InfoRow label="GUID" value={character.guid} />
            <InfoRow label="名称" value={character.name} />
            <InfoRow label="等级" value={character.level} />
            <InfoRow label="种族" value={raceMap[character.race] || '未知'} />
            <InfoRow label="职业" value={classMap[character.class] || '未知'} />
            <InfoRow
              label="状态"
              value={character.online ? <span className="text-green-400">在线</span> : '离线'}
            />
          </InfoCard>

          <InfoCard title="属性与进度">
            <InfoRow label="经验值" value={character.xp.toLocaleString()} />
            <InfoRow
              label="金币"
              value={`${gold}金 ${silver}银 ${copper}铜`}
            />
            <InfoRow label="竞技场点数" value={character.arenaPoints} />
            <InfoRow label="荣誉点数" value={character.totalHonorPoints} />
            <InfoRow label="总击杀数" value={character.totalKills} />
            <InfoRow
              label="总在线时长"
              value={`${Math.floor(character.totalTime / 3600)} 小时`}
            />
          </InfoCard>
        </div>
      </div>
    
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
