import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useCharacterDetail,
  useUnbanCharacter,
  useBanCharacter,
  useMuteCharacter,
  useUnmuteCharacter,
} from '@/features/character/hooks/useCharacter';
import { Dialog } from '@/shared/components/Dialog';

const raceMap: Record<number, string> = {
  1: '人类', 2: '兽人', 3: '矮人', 4: '暗夜精灵', 5: '亡灵',
  6: '牛头人', 7: '侏儒', 8: '巨魔', 9: '地精', 10: '血精灵',
  11: '德莱尼', 22: '狼人',
};

const classMap: Record<number, string> = {
  1: '战士', 2: '圣骑士', 3: '猎人', 4: '潜行者', 5: '牧师',
  6: '死亡骑士', 7: '萨满', 8: '法师', 9: '术士', 11: '德鲁伊',
};

const banReasonOptions = [
  { value: '违规', label: '违规' },
  { value: '使用外挂/作弊', label: '使用外挂/作弊' },
  { value: '恶意刷屏', label: '恶意刷屏' },
  { value: '辱骂他人', label: '辱骂他人' },
  { value: '欺诈/诈骗', label: '欺诈/诈骗' },
  { value: '恶意利用BUG', label: '恶意利用BUG' },
  { value: '__custom__', label: '其他（手动输入）' },
];

const durationLabels: Record<string, string> = {
  '1h': '1小时',
  '1d': '1天',
  '7d': '7天',
  '30d': '30天',
  '-1': '永久',
};

export default function CharacterDetailPage() {
  const { guid } = useParams<{ guid: string }>();
  const navigate = useNavigate();
  const characterGuid = parseInt(guid || '0');
  const { data: character, isLoading } = useCharacterDetail(characterGuid);
  const unbanMutation = useUnbanCharacter();
  const banMutation = useBanCharacter();
  const muteMutation = useMuteCharacter();
  const unmuteMutation = useUnmuteCharacter();

  const [showBanDialog, setShowBanDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [banDuration, setBanDuration] = useState('1d');
  const [banReasonType, setBanReasonType] = useState('违规');
  const [customReason, setCustomReason] = useState('');

  const [showMuteDialog, setShowMuteDialog] = useState(false);
  const [muteDuration, setMuteDuration] = useState('1h');
  const [muteReasonType, setMuteReasonType] = useState('恶意刷屏');
  const [muteCustomReason, setMuteCustomReason] = useState('');

  const isCustomReason = banReasonType === '__custom__';
  const finalBanReason = isCustomReason ? customReason : banReasonType;
  const canProceed = !isCustomReason || customReason.trim().length > 0;

  const isMuteCustomReason = muteReasonType === '__custom__';
  const finalMuteReason = isMuteCustomReason ? muteCustomReason : muteReasonType;
  const canMuteProceed = !isMuteCustomReason || muteCustomReason.trim().length > 0;

  const handleOpenBanDialog = () => {
    setBanDuration('1d');
    setBanReasonType('违规');
    setCustomReason('');
    setShowBanDialog(true);
  };

  const handleProceedToConfirm = () => {
    if (!canProceed) return;
    setShowBanDialog(false);
    setShowConfirmDialog(true);
  };

  const handleExecuteBan = () => {
    banMutation.mutate(
      { guid: characterGuid, data: { duration: banDuration, reason: finalBanReason } },
      {
        onSuccess: () => {
          setShowConfirmDialog(false);
        },
      }
    );
  };

  const handleUnban = () => {
    if (!confirm('确认解禁该角色？')) return;
    unbanMutation.mutate(characterGuid);
  };

  const handleOpenMuteDialog = () => {
    setMuteDuration('1h');
    setMuteReasonType('恶意刷屏');
    setMuteCustomReason('');
    setShowMuteDialog(true);
  };

  const handleExecuteMute = () => {
    if (!canMuteProceed) return;
    muteMutation.mutate(
      { guid: characterGuid, data: { duration: muteDuration, reason: finalMuteReason } },
      {
        onSuccess: () => {
          setShowMuteDialog(false);
        },
      }
    );
  };

  const handleUnmute = () => {
    if (!confirm('确认解除该角色的聊天禁言？')) return;
    unmuteMutation.mutate(characterGuid);
  };

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
  const activeBans = character.bans?.filter((b) => b.active) || [];

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

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{character.name}</h1>
        <div className="flex gap-2">
          <button
            onClick={handleOpenMuteDialog}
            className="px-4 py-2 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
          >
            禁言聊天
          </button>
          <button
            onClick={handleUnmute}
            disabled={unmuteMutation.isPending}
            className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {unmuteMutation.isPending ? '处理中...' : '解禁聊天'}
          </button>
          {activeBans.length > 0 ? (
            <button
              onClick={handleUnban}
              disabled={unbanMutation.isPending}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {unbanMutation.isPending ? '处理中...' : '解禁角色'}
            </button>
          ) : (
            <button
              onClick={handleOpenBanDialog}
              className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700"
            >
              封禁角色
            </button>
          )}
        </div>
      </div>

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
          <InfoRow label="所属账号" value={character.accountUsername} />
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

      {character.bans && character.bans.length > 0 && (
        <InfoCard title="封禁记录">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-muted-foreground">封禁时间</th>
                  <th className="px-3 py-2 text-left text-muted-foreground">解封时间</th>
                  <th className="px-3 py-2 text-left text-muted-foreground">操作人</th>
                  <th className="px-3 py-2 text-left text-muted-foreground">原因</th>
                  <th className="px-3 py-2 text-left text-muted-foreground">状态</th>
                </tr>
              </thead>
              <tbody>
                {character.bans.map((ban, index) => (
                  <tr key={index} className="border-b border-border">
                    <td className="px-3 py-2">
                      {new Date(ban.banDate).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-3 py-2">
                      {new Date(ban.unbanDate).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-3 py-2">{ban.bannedBy}</td>
                    <td className="px-3 py-2">{ban.banReason}</td>
                    <td className="px-3 py-2">
                      {ban.active ? (
                        <span className="text-red-400">生效中</span>
                      ) : (
                        <span className="text-green-400">已解除</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </InfoCard>
      )}

      <Dialog
        open={showBanDialog}
        onClose={() => setShowBanDialog(false)}
        title="封禁角色"
        footer={
          <>
            <button
              onClick={() => setShowBanDialog(false)}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              取消
            </button>
            <button
              onClick={handleProceedToConfirm}
              disabled={!canProceed}
              className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              下一步
            </button>
          </>
        }
      >
        <div className="bg-muted/50 rounded-md p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">目标角色</span>
            <span className="font-medium">{character.name}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">角色GUID</span>
            <span>{character.guid}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">封禁时长</label>
          <select
            value={banDuration}
            onChange={(e) => setBanDuration(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="1h">1小时</option>
            <option value="1d">1天</option>
            <option value="7d">7天</option>
            <option value="30d">30天</option>
            <option value="-1">永久</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">封禁原因</label>
          <select
            value={banReasonType}
            onChange={(e) => setBanReasonType(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {banReasonOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {isCustomReason && (
          <div>
            <label className="block text-sm font-medium mb-1.5">自定义原因</label>
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="请输入封禁原因"
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </Dialog>

      <Dialog
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        title="确认封禁"
        footer={
          <>
            <button
              onClick={() => {
                setShowConfirmDialog(false);
                setShowBanDialog(true);
              }}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              返回修改
            </button>
            <button
              onClick={handleExecuteBan}
              disabled={banMutation.isPending}
              className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {banMutation.isPending ? '处理中...' : '确认封禁'}
            </button>
          </>
        }
      >
        <div className="text-sm text-muted-foreground mb-4">
          请再次确认以下封禁信息，操作后将立即生效：
        </div>

        <div className="space-y-3 bg-muted/50 rounded-md p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">目标角色</span>
            <span className="font-medium">{character.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">封禁时长</span>
            <span className="font-medium text-red-400">{durationLabels[banDuration]}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">封禁原因</span>
            <span className="font-medium">{finalBanReason}</span>
          </div>
        </div>
      </Dialog>

      {/* 禁言对话框 */}
      <Dialog
        open={showMuteDialog}
        onClose={() => setShowMuteDialog(false)}
        title="禁言角色"
        footer={
          <>
            <button
              onClick={() => setShowMuteDialog(false)}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              取消
            </button>
            <button
              onClick={handleExecuteMute}
              disabled={!canMuteProceed || muteMutation.isPending}
              className="px-4 py-2 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {muteMutation.isPending ? '处理中...' : '确认禁言'}
            </button>
          </>
        }
      >
        <div className="bg-muted/50 rounded-md p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">目标角色</span>
            <span className="font-medium">{character.name}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">角色GUID</span>
            <span>{character.guid}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">禁言时长</label>
          <select
            value={muteDuration}
            onChange={(e) => setMuteDuration(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="10m">10分钟</option>
            <option value="1h">1小时</option>
            <option value="1d">1天</option>
            <option value="7d">7天</option>
            <option value="30d">30天</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">禁言原因</label>
          <select
            value={muteReasonType}
            onChange={(e) => setMuteReasonType(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {banReasonOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {isMuteCustomReason && (
          <div>
            <label className="block text-sm font-medium mb-1.5">自定义原因</label>
            <input
              type="text"
              value={muteCustomReason}
              onChange={(e) => setMuteCustomReason(e.target.value)}
              placeholder="请输入禁言原因"
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </Dialog>
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
