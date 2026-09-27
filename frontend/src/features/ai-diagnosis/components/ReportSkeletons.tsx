// 巡检报告页首屏骨架：占位与真实卡片同构（月历/上传状态条），数据就绪前整体渲染，
// 避免各区块随各自请求分批弹入造成布局跳动

export function ReportCalendarSkeleton() {
  return (
    <div className='rounded-lg border border-border bg-card p-3' aria-busy='true' aria-label='巡检日历加载中'>
      <div className='mb-2 flex items-center gap-1'>
        <div className='h-4 w-16 animate-pulse rounded bg-muted' />
        <div className='ml-auto flex items-center gap-1'>
          <div className='h-5 w-20 animate-pulse rounded bg-muted' />
        </div>
      </div>
      <div className='grid grid-cols-7 gap-0.5'>
        {Array.from({ length: 7 + 35 }, (_, i) => (
          <div
            key={i}
            className='aspect-square animate-pulse rounded bg-muted'
            style={{ animationDelay: `${(i % 7) * 60}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function UploadStatusSkeleton() {
  return (
    <div className='rounded-lg border border-border bg-card p-3' aria-busy='true' aria-label='上传状态加载中'>
      <div className='mb-2 h-3 w-44 animate-pulse rounded bg-muted' />
      <div className='flex flex-wrap gap-2'>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className='h-6 w-16 animate-pulse rounded bg-muted' />
        ))}
      </div>
    </div>
  );
}
