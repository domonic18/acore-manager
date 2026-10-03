import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { patrolFindingsApi, type PatrolFindingStatus, type PatrolFindingsFilter } from '../api/patrol-findings.api';

export function usePatrolFindings(filter: PatrolFindingsFilter, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['ai-diagnosis', 'patrol-findings', filter],
    queryFn: () => patrolFindingsApi.list(filter),
    enabled: options?.enabled,
  });
}

export function usePatrolFindingsDailySummary(from: string, to: string) {
  return useQuery({
    queryKey: ['ai-diagnosis', 'patrol-findings-daily-summary', from, to],
    queryFn: () => patrolFindingsApi.dailySummary(from, to),
    staleTime: 60_000,
  });
}

export function useUpdateFindingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: PatrolFindingStatus }) => patrolFindingsApi.updateStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-diagnosis', 'patrol-findings'] });
    },
  });
}
