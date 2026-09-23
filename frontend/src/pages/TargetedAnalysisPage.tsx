import { useQueryClient } from '@tanstack/react-query';
import { TargetedAnalysisRunner } from '@/features/ai-diagnosis/components/TargetedAnalysisRunner';
import { TargetedHistoryList } from '@/features/ai-diagnosis/components/TargetedHistoryList';

export default function TargetedAnalysisPage() {
  const queryClient = useQueryClient();

  // 单次分析约 1-4 分钟，结束后刷新历史列表（running → ok/failed）
  const refreshHistory = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['ai-diagnosis', 'targeted'] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">定向分析</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          针对单个角色/账号的违规取证与申诉研判，结论自动落库，可在历史中回看（需求 3.8）
        </p>
      </div>
      <TargetedAnalysisRunner onFinished={refreshHistory} />
      <TargetedHistoryList />
    </div>
  );
}
