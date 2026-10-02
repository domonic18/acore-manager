import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePermission } from '@/shared/hooks/usePermission';
import { toast } from '@/shared/utils/toast.util';
import { HonorAdjustDialog } from '@/shared/components/HonorAdjustDialog';
import type { BgFarmEvidence, CarryEvidence, PatrolFinding, PatrolFindingType } from '../api/patrol-findings.api';
import { usePatrolFindings, useUpdateFindingStatus } from '../hooks/usePatrolFindings';
import { SendWarningMailDialog } from './SendWarningMailDialog';

// 违规巡检 tab（需求一/二）：展示当日反滥用巡检发现（战场互刷 / 硬核被带），
// 行内处置：警告邮件 / 深度分析 / 荣誉调整（仅互刷类，gm3）/ 状态流转（gm2）。

const TYPE_LABEL: Record<PatrolFindingType, string> = {
  bg_honor_farm: '战场互刷',
  hardcore_carry: '硬核被带',
};

const TYPE_STYLE: Record<PatrolFindingType, string> = {
  bg_honor_farm: 'bg-red-500/20 text-red-400',
  hardcore_carry: 'bg-purple-500/20 text-purple-400',
};

const STATUS_LABEL = { open: '待处置', actioned: '已处置', dismissed: '已忽略' } as const;
const STATUS_STYLE = {
  open: 'bg-amber-500/20 text-amber-400',
  actioned: 'bg-emerald-500/20 text-emerald-400',
  dismissed: 'bg-muted text-muted-foreground',
} as const;

const MAX_ANALYSIS_SUBJECTS = 10;

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function reasonOf(finding: PatrolFinding): string {
  if (finding.findingType === 'bg_honor_farm') {
    const ev = finding.evidenceJson as BgFarmEvidence;
    return `战场互刷嫌疑：同 IP ${ev.sameIpAccounts} 账号，人均 HK ${ev.avgHonorableKills} / 人均死亡 ${ev.avgDeaths} / 每杀伤害 ${ev.damagePerKill}`;
  }
  const ev = finding.evidenceJson as CarryEvidence;
  const first = ev.pairs?.[0];
  return first
    ? `硬核被带嫌疑：${first.hardcore} 与 ${first.main} 同区域 ${first.distanceYd} 码内共现`
    : '硬核被带嫌疑：同 IP 大号近距离护送';
}

function EvidenceSummary({ finding }: { finding: PatrolFinding }) {
  if (finding.findingType === 'bg_honor_farm') {
    const ev = finding.evidenceJson as BgFarmEvidence;
    const signals = [
      ev.signals.highHK && '高击杀',
      ev.signals.highDeaths && '高死亡',
      ev.signals.lowDamage && '低伤害',
    ].filter(Boolean) as string[];
    return (
      <div className="text-xs text-muted-foreground">
        战场 #{ev.battlegroundId} · {ev.battleDate} · 人均 HK <span className="text-foreground">{ev.avgHonorableKills}</span> / 人均死亡{' '}
        <span className="text-foreground">{ev.avgDeaths}</span> / 每杀伤害 <span className="text-foreground">{ev.damagePerKill}</span>
        <span className="ml-2 rounded bg-accent/60 px-1.5 py-0.5">{signals.join(' + ')}</span>
      </div>
    );
  }
  const ev = finding.evidenceJson as CarryEvidence;
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      {(ev.pairs ?? []).map((p, i) => (
        <div key={i}>
          {p.hardcore} ← {p.main} · 地图 {p.map} 区域 {p.zone} · 距离 <span className="text-foreground">{p.distanceYd}</span> 码
        </div>
      ))}
    </div>
  );
}

export function PatrolFindingsTab({ realm, reportDate }: { realm: string; reportDate: string }) {
  const { hasGmLevel } = usePermission();
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState<PatrolFindingType | ''>('');
  const [mailTarget, setMailTarget] = useState<PatrolFinding | null>(null);
  const [honorTarget, setHonorTarget] = useState<string | null>(null);

  const { data, isLoading } = usePatrolFindings({
    date: reportDate,
    ...(typeFilter ? { type: typeFilter } : {}),
    pageSize: 50,
  });
  const updateStatus = useUpdateFindingStatus();

  const findings = useMemo(() => data?.items ?? [], [data]);

  const mailTargets = useMemo(
    () => (mailTarget ? mailTarget.subjectsJson.map((s) => ({ guid: s.characterGuid, name: s.characterName })) : []),
    [mailTarget],
  );
  const mailReasons = useMemo(
    () => Object.fromEntries((mailTarget?.subjectsJson ?? []).map((s) => [s.characterName, reasonOf(mailTarget as PatrolFinding)])),
    [mailTarget],
  );

  const handleStatus = (finding: PatrolFinding, status: 'actioned' | 'dismissed'): void => {
    updateStatus.mutate(
      { id: finding.id, status },
      {
        onSuccess: () => toast.success(`已标记${STATUS_LABEL[status]}`),
        onError: (err: Error) => toast.error(err.message || '状态更新失败'),
      },
    );
  };

  const startDeepAnalysis = (finding: PatrolFinding): void => {
    const names = finding.subjectsJson.map((s) => s.characterName).slice(0, MAX_ANALYSIS_SUBJECTS);
    navigate('/ai-diagnosis/targeted', {
      state: { subjectType: 'character', subjectNames: names, timeFrom: reportDate, timeTo: reportDate },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(['', 'bg_honor_farm', 'hardcore_carry'] as const).map((t) => (
          <button
            key={t || 'all'}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              typeFilter === t ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {t === '' ? '全部' : TYPE_LABEL[t]}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground">共 {data?.total ?? 0} 条</span>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">加载中...</div>
      ) : findings.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">本日无巡检发现</div>
      ) : (
        <div className="space-y-2">
          {findings.map((f) => (
            <div key={f.id} className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${TYPE_STYLE[f.findingType]}`}>{TYPE_LABEL[f.findingType]}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[f.status]}`}>{STATUS_LABEL[f.status]}</span>
                {f.occurrenceCount > 1 && (
                  <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-400">第 {f.occurrenceCount} 轮共现</span>
                )}
                <span className="text-xs text-muted-foreground">{timeOf(f.detectedAt)}</span>
              </div>

              <EvidenceSummary finding={f} />

              <div className="mt-2 space-y-0.5">
                {f.subjectsJson.map((s) => (
                  <div key={s.characterGuid} className="flex flex-wrap items-center gap-x-2 text-sm">
                    <Link to={`/characters/${s.characterGuid}`} className="font-medium text-primary hover:underline">
                      {s.characterName}
                    </Link>
                    {s.hardcore ? (
                      <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-purple-400">
                        硬核 Lv{s.extra?.hardcoreLevel ?? '?'}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Lv{s.level}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      账号 {s.accountName || s.accountId} · IP {s.ip}
                    </span>
                    {f.findingType === 'bg_honor_farm' && hasGmLevel(3) && (
                      <button
                        onClick={() => setHonorTarget(s.characterName)}
                        className="ml-auto whitespace-nowrap rounded-md border border-red-500/40 px-2 py-0.5 text-xs font-medium text-red-400 hover:bg-red-500/10"
                      >
                        荣誉调整
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setMailTarget(f)}
                  className="whitespace-nowrap rounded-md border border-amber-500/40 px-2 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/10"
                >
                  警告邮件
                </button>
                <button
                  onClick={() => startDeepAnalysis(f)}
                  className="whitespace-nowrap rounded-md border border-sky-500/40 px-2 py-1 text-xs font-medium text-sky-400 hover:bg-sky-500/10"
                >
                  深度分析
                </button>
                {f.status === 'open' && hasGmLevel(2) && (
                  <>
                    <button
                      onClick={() => handleStatus(f, 'actioned')}
                      disabled={updateStatus.isPending}
                      className="whitespace-nowrap rounded-md border border-emerald-500/40 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40"
                    >
                      标记已处置
                    </button>
                    <button
                      onClick={() => handleStatus(f, 'dismissed')}
                      disabled={updateStatus.isPending}
                      className="whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-40"
                    >
                      忽略
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <SendWarningMailDialog
        targets={mailTargets}
        reasonsByTarget={mailReasons}
        reportDate={reportDate}
        refReport={`${realm}:${reportDate}`}
        open={!!mailTarget}
        onClose={() => setMailTarget(null)}
      />
      <HonorAdjustDialog
        characterName={honorTarget ?? ''}
        titlePrefix="荣誉调整"
        open={!!honorTarget}
        onClose={() => setHonorTarget(null)}
      />
    </div>
  );
}
