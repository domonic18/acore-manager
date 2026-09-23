import { useQuery } from '@tanstack/react-query';
import { aiAnalysisApi } from '../api/ai-analysis.api';

export function useTargetedList(page: number, subjectName?: string) {
  return useQuery({
    queryKey: ['ai-diagnosis', 'targeted', 'list', page, subjectName ?? ''],
    queryFn: () => aiAnalysisApi.list(page, subjectName),
  });
}

export function useTargetedDetail(id: number | null) {
  return useQuery({
    queryKey: ['ai-diagnosis', 'targeted', 'detail', id],
    queryFn: () => aiAnalysisApi.detail(id as number),
    enabled: id != null,
  });
}
