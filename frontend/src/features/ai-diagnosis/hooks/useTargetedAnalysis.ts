import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function useUpdateTargetedAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { gmRemark?: string; conclusionMarkdown?: string } }) =>
      aiAnalysisApi.update(id, patch),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['ai-diagnosis', 'targeted', 'detail', vars.id] });
      void queryClient.invalidateQueries({ queryKey: ['ai-diagnosis', 'targeted', 'list'] });
    },
  });
}

export function useDeleteTargetedAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => aiAnalysisApi.remove(id),
    onSuccess: () => {
      // 只失效列表：详情查询此时仍挂在详情页上，若一并失效会对已删除记录发 GET（404 报错）
      void queryClient.invalidateQueries({ queryKey: ['ai-diagnosis', 'targeted', 'list'] });
    },
  });
}
