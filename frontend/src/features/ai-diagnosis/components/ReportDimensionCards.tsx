import type { AiReportDetail } from '../api/ai-diagnosis.api';
import type { PatrolFindingType } from '../api/patrol-findings.api';
import { usePatrolFindings } from '../hooks/usePatrolFindings';

// 报告页顶部巡检维度总览：每个巡检维度一张卡（当日结果 + 点击跳对应 tab）。
// 新增巡检类型 = cards 追加一项 + type 枚举扩值，布局不变。

export type DimensionTab = 'health' | 'players' | 'patrol';

interface DimensionCard {
  label: string;
  sub: string;
  tab: DimensionTab;
  focusType?: PatrolFindingType;
  value: string;
  unit: string;
  tone: string;
}

function useDimensionCards(report: AiReportDetail): DimensionCard[] {
  const players = report.contentJson?.suspiciousPlayers ?? [];
  const { data: bgData, isLoading: bgLoading } = usePatrolFindings({
    date: report.reportDate,
    type: 'bg_honor_farm',
    page: 1,
    pageSize: 1,
  });
  const { data: carryData, isLoading: carryLoading } = usePatrolFindings({
    date: report.reportDate,
    type: 'hardcore_carry',
    page: 1,
    pageSize: 1,
  });

  const countTone = (n: number): string => (n > 0 ? 'text-red-400' : 'text-green-400');
  const healthTone = report.healthScore >= 80 ? 'text-green-400' : report.healthScore >= 60 ? 'text-yellow-400' : 'text-red-400';

  return [
    {
      label: '服务器健康',
      sub: '崩溃 / 错误 / 认证异常',
      tab: 'health',
      value: String(report.healthScore),
      unit: '分',
      tone: healthTone,
    },
    {
      label: '反作弊嫌疑',
      sub: '反作弊日志 AI 研判',
      tab: 'players',
      value: String(players.length),
      unit: '人',
      tone: countTone(players.length),
    },
    {
      label: '战场互刷',
      sub: '当日新增发现',
      tab: 'patrol',
      focusType: 'bg_honor_farm',
      value: bgLoading ? '…' : String(bgData?.total ?? 0),
      unit: '条',
      tone: countTone(bgData?.total ?? 0),
    },
    {
      label: '硬核被带',
      sub: '当日新增发现',
      tab: 'patrol',
      focusType: 'hardcore_carry',
      value: carryLoading ? '…' : String(carryData?.total ?? 0),
      unit: '条',
      tone: countTone(carryData?.total ?? 0),
    },
  ];
}

export function ReportDimensionCards({
  report,
  onGoTab,
}: {
  report: AiReportDetail;
  onGoTab: (tab: DimensionTab, focusType?: PatrolFindingType) => void;
}) {
  const cards = useDimensionCards(report);
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {cards.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => onGoTab(c.tab, c.focusType)}
          className="rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent"
        >
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div className={`text-2xl font-bold ${c.tone}`}>
            {c.value}
            <span className="ml-1 text-xs font-normal text-muted-foreground">{c.unit}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">{c.sub}</div>
        </button>
      ))}
    </div>
  );
}
