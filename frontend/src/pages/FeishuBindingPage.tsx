import { FeishuBindingManager } from '@/features/feishu-binding/components/FeishuBindingManager';

export default function FeishuBindingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">飞书免登绑定</h1>
        <p className="text-sm text-muted-foreground mt-1">
          维护飞书用户与后台 AC 账号的 1:1 映射；凭证在系统配置中设置，未配置时免登整体关闭。
        </p>
      </div>

      <FeishuBindingManager />
    </div>
  );
}
