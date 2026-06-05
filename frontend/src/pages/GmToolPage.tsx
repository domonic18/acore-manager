import { useState } from 'react';
import { AppLayout } from '@/shared/components/AppLayout';
import { useBroadcast, useSendItems, useFindPlayer } from '@/features/gm-tool/hooks/useGmTool';

export function GmToolPage() {
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [itemId, setItemId] = useState('');
  const [findName, setFindName] = useState('');
  const [findResult, setFindResult] = useState('');

  const broadcastMutation = useBroadcast();
  const sendItemsMutation = useSendItems();
  const findPlayerMutation = useFindPlayer();

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    await broadcastMutation.mutateAsync(broadcastMessage);
    setBroadcastMessage('');
    alert('广播发送成功');
  };

  const handleSendItems = async () => {
    if (!playerName.trim() || !itemId.trim()) return;
    await sendItemsMutation.mutateAsync({
      playerName,
      itemId: parseInt(itemId),
    });
    setPlayerName('');
    setItemId('');
    alert('物品发送成功');
  };

  const handleFindPlayer = async () => {
    if (!findName.trim()) return;
    const result = await findPlayerMutation.mutateAsync(findName);
    setFindResult(result.result);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">GM 工具</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Broadcast */}
          <ToolCard title="广播消息">
            <textarea
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder="输入广播内容"
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-none"
            />
            <button
              onClick={handleBroadcast}
              disabled={broadcastMutation.isPending}
              className="w-full py-2 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {broadcastMutation.isPending ? '发送中...' : '发送广播'}
            </button>
          </ToolCard>

          {/* Send Items */}
          <ToolCard title="发放物品">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="玩家名称"
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="number"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder="物品 ID"
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleSendItems}
              disabled={sendItemsMutation.isPending}
              className="w-full py-2 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {sendItemsMutation.isPending ? '发送中...' : '发送物品'}
            </button>
          </ToolCard>

          {/* Find Player */}
          <ToolCard title="查找玩家">
            <div className="flex gap-2">
              <input
                type="text"
                value={findName}
                onChange={(e) => setFindName(e.target.value)}
                placeholder="玩家名称"
                className="flex-1 px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={handleFindPlayer}
                disabled={findPlayerMutation.isPending}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {findPlayerMutation.isPending ? '查找中...' : '查找'}
              </button>
            </div>
            {findResult && (
              <pre className="mt-2 p-3 rounded-md bg-secondary text-xs overflow-auto max-h-[200px]">
                {findResult}
              </pre>
            )}
          </ToolCard>
        </div>
      </div>
    </AppLayout>
  );
}

function ToolCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}
