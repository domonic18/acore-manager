import { Link, useParams } from 'react-router-dom';
import { TargetedAnalysisDetailView } from '@/features/ai-diagnosis/components/TargetedAnalysisDetailView';

export default function TargetedAnalysisDetailPage() {
  const { id } = useParams();
  const numId = Number(id);

  if (!Number.isInteger(numId) || numId < 1) {
    return <div className="py-8 text-center text-muted-foreground">无效的分析 ID</div>;
  }

  return (
    <div className="space-y-4">
      <Link to="/ai-diagnosis/targeted" className="text-sm text-primary hover:underline">
        ← 返回定向分析
      </Link>
      <TargetedAnalysisDetailView id={numId} />
    </div>
  );
}
