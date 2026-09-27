import { useReportFilters } from '@/features/ai-diagnosis/hooks/useReportFilters';
import { UploadStatusStrip } from '@/features/ai-diagnosis/components/UploadStatusStrip';
import { ReportCalendar } from '@/features/ai-diagnosis/components/ReportCalendar';
import { ReportCalendarSkeleton, UploadStatusSkeleton } from '@/features/ai-diagnosis/components/ReportSkeletons';
import { ReportListTable } from '@/features/ai-diagnosis/components/ReportListTable';
import { TriggerInspectionButton } from '@/features/ai-diagnosis/components/TriggerInspectionButton';
import { TimeRangeFilter } from '@/shared/components/TimeRangeFilter';

export default function AiDiagnosisPage() {
  const filters = useReportFilters();
  // 首屏整体加载态：默认 realm 未就绪或报告在拉时，月历/上传状态/表格统一骨架渲染，不分块弹入
  const pageLoading = !filters.realm || filters.isLoading;

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-bold'>AI 巡检报告</h1>

      <div className='grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]'>
        <aside className='order-2 lg:order-none'>
          {filters.realm && filters.reports ? (
            <ReportCalendar reports={filters.reports} realm={filters.realm} />
          ) : (
            <ReportCalendarSkeleton />
          )}
        </aside>

        <div className='order-1 min-w-0 space-y-4 lg:order-none'>
          <div className='flex flex-wrap gap-2'>
            <input
              value={filters.realmInput}
              onChange={(e) => filters.setRealmInput(e.target.value)}
              placeholder='realm 名'
              className='w-40 rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary'
            />
            <TimeRangeFilter
              label='日期'
              value={filters.dateRange}
              onChange={filters.setDateRange}
            />
            <button
              onClick={filters.applyRealm}
              className='rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground'
            >
              筛选
            </button>
            <TriggerInspectionButton
              realm={filters.realmInput.trim() || undefined}
              date={filters.dateRange?.from || undefined}
            />
          </div>

          {filters.realm ? <UploadStatusStrip realm={filters.realm} /> : <UploadStatusSkeleton />}

          <ReportListTable
            rows={filters.filtered}
            loading={pageLoading}
            emptyText={filters.dateRange ? '该日期范围内暂无巡检报告' : '暂无巡检报告'}
          />
        </div>
      </div>
    </div>
  );
}
