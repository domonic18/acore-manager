import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReports } from '@/features/ai-diagnosis/hooks/useAiDiagnosis';
import { UploadStatusStrip } from '@/features/ai-diagnosis/components/UploadStatusStrip';
import { ReportCalendar } from '@/features/ai-diagnosis/components/ReportCalendar';

export default function AiDiagnosisPage() {
  const navigate = useNavigate();
  const [realm, setRealm] = useState('realm3');
  const [realmInput, setRealmInput] = useState('realm3');
  const [dateFilter, setDateFilter] = useState('');
  const { data: reports, isLoading } = useReports(realm || undefined);

  const filtered =
    reports?.filter((r) => dateFilter === '' || r.reportDate === dateFilter) ??
    [];

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-bold'>AI 巡检报告</h1>

      <div className='grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]'>
        {realm && reports && (
          <aside className='order-2 lg:order-none'>
            <ReportCalendar reports={reports} realm={realm} />
          </aside>
        )}

        <div className='order-1 min-w-0 space-y-4 lg:order-none'>
          <div className='flex flex-wrap gap-2'>
            <input
              value={realmInput}
              onChange={(e) => setRealmInput(e.target.value)}
              placeholder='realm 名'
              className='w-40 rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary'
            />
            <input
              type='date'
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className='rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary'
            />
            {dateFilter !== '' && (
              <button
                onClick={() => setDateFilter('')}
                className='rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent'
              >
                清除
              </button>
            )}
            <button
              onClick={() => setRealm(realmInput.trim())}
              className='rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground'
            >
              筛选
            </button>
          </div>

          {realm && <UploadStatusStrip realm={realm} />}

          <div className='rounded-lg border border-border overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-border bg-card'>
                  <th className='px-4 py-3 text-left font-medium text-muted-foreground'>
                    日期
                  </th>
                  <th className='px-4 py-3 text-left font-medium text-muted-foreground'>
                    服务器
                  </th>
                  <th className='px-4 py-3 text-left font-medium text-muted-foreground'>
                    健康分
                  </th>
                  <th className='px-4 py-3 text-left font-medium text-muted-foreground'>
                    状态
                  </th>
                  <th className='px-4 py-3 text-left font-medium text-muted-foreground'>
                    触发
                  </th>
                  <th className='px-4 py-3 text-left font-medium text-muted-foreground'>
                    摘要
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className='px-4 py-8 text-center text-muted-foreground'
                    >
                      加载中...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className='px-4 py-8 text-center text-muted-foreground'
                    >
                      {dateFilter !== ''
                        ? '该日期暂无巡检报告'
                        : '暂无巡检报告'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() =>
                        navigate(`/ai-diagnosis/${r.realm}/${r.reportDate}`)
                      }
                      className='cursor-pointer border-b border-border hover:bg-accent/50'
                    >
                      <td className='px-4 py-3 whitespace-nowrap'>
                        {r.reportDate}
                      </td>
                      <td className='px-4 py-3'>{r.realm}</td>
                      <td className='px-4 py-3'>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            r.healthScore < 60
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-green-500/20 text-green-400'
                          }`}
                        >
                          {r.healthScore}
                        </span>
                      </td>
                      <td className='px-4 py-3'>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            r.status === 'ok'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {r.status === 'ok' ? '正常' : r.status}
                        </span>
                      </td>
                      <td className='px-4 py-3 text-muted-foreground'>
                        {r.generatedBy}
                      </td>
                      <td className='max-w-[24rem] truncate px-4 py-3 text-muted-foreground'>
                        {r.summary}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
