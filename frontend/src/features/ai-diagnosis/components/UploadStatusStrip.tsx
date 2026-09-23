import { useUploadStatus } from '../hooks/useAiDiagnosis';
import type { UploadStatusDay } from '../api/ai-diagnosis.api';

function dayClass(day: UploadStatusDay): string {
  if (!day.present) return 'bg-red-500/20 text-red-400';
  return day.missingTypes.length === 0 ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400';
}

function dayLabel(day: UploadStatusDay): string {
  if (!day.present) return '断传';
  return day.missingTypes.length === 0 ? '齐全' : `缺${day.missingTypes.length}类`;
}

export function UploadStatusStrip({ realm }: { realm: string }) {
  const { data: days, isLoading } = useUploadStatus(realm, 7);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 text-xs text-muted-foreground">近 7 天日志上传（realm: {realm}）</div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">检查中...</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {days?.map((day) => (
            <div
              key={day.date}
              title={day.missingTypes.length > 0 ? `缺失: ${day.missingTypes.join(', ')}` : '四类日志齐全'}
              className={`rounded px-2 py-1 text-xs font-medium ${dayClass(day)}`}
            >
              {day.date.slice(5)} · {dayLabel(day)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
