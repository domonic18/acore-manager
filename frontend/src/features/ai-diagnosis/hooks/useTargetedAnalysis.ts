import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiAnalysisApi, type TargetedAnalysisInput, type TargetedAnalysisSummary } from '../api/ai-analysis.api';

// 有进行中的任务时 5s 轮询：列表看整体进度，详情看单条落库结论
const RUNNING_POLL_MS = 5000;

export function useTargetedList(page: number, subjectName?: string) {
  return useQuery({
    queryKey: ['ai-diagnosis', 'targeted', 'list', page, subjectName ?? ''],
    queryFn: () => aiAnalysisApi.list(page, subjectName),
    refetchInterval: (query) =>
      (query.state.data as TargetedAnalysisSummary[] | undefined)?.some((item) => item.status === 'running')
        ? RUNNING_POLL_MS
        : false,
  });
}

export function useTargetedDetail(id: number | null) {
  return useQuery({
    queryKey: ['ai-diagnosis', 'targeted', 'detail', id],
    queryFn: () => aiAnalysisApi.detail(id as number),
    enabled: id != null,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? RUNNING_POLL_MS : false),
  });
}

export function useCreateTargetedAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TargetedAnalysisInput) => aiAnalysisApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-diagnosis', 'targeted', 'list'] });
    },
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
