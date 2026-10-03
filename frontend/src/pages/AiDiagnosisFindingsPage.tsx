import { Link } from 'react-router-dom';
import { useDefaultRealm } from '@/shared/hooks/useDefaultRealm';
import { PatrolFindingsTab } from '@/features/ai-diagnosis/components/PatrolFindingsTab';

// 违规巡检队列（跨天工作台）：与报告页按日视图分离——这里默认全量日期、面向处置流转；
// 按日期回看某天的巡检结论请前往巡检报告详情页。

export default function AiDiagnosisFindingsPage() {
  const defaultRealm = useDefaultRealm();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">违规巡检队列</h1>
        <Link to="/ai-diagnosis" className="text-sm text-primary hover:underline">
          返回巡检报告
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        跨日期的巡检发现处置工作台：默认展示全部日期的发现（战场互刷 / 硬核被带），按检测时间倒序。
      </p>
      {defaultRealm ? <PatrolFindingsTab realm={defaultRealm} defaultDate="" /> : null}
    </div>
  );
}
