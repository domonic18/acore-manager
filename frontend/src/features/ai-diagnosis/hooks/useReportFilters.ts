import { useEffect, useMemo, useState } from 'react';
import { useReports } from '@/features/ai-diagnosis/hooks/useAiDiagnosis';
import { useDefaultRealm } from '@/shared/hooks/useDefaultRealm';
import type { TimeRange } from '@/shared/components/TimeRangeFilter';

export function useReportFilters() {
  const defaultRealm = useDefaultRealm();
  const [realm, setRealm] = useState('');
  const [realmInput, setRealmInput] = useState('');
  const [dateRange, setDateRange] = useState<TimeRange | null>(null);
  const { data: reports, isLoading } = useReports(realm || undefined);

  // 系统配置的默认 realm 加载完成后填充（未加载前不发查询，realm 为空）
  useEffect(() => {
    if (defaultRealm) {
      setRealm((prev) => prev || defaultRealm);
      setRealmInput((prev) => prev || defaultRealm);
    }
  }, [defaultRealm]);

  const filtered = useMemo(
    () =>
      (reports ?? []).filter(
        (r) => !dateRange || (r.reportDate >= dateRange.from && r.reportDate <= dateRange.to),
      ),
    [reports, dateRange],
  );

  const applyRealm = () => setRealm(realmInput.trim());

  return {
    realm,
    realmInput,
    setRealmInput,
    applyRealm,
    dateRange,
    setDateRange,
    reports,
    isLoading,
    filtered,
  };
}
