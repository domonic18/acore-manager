import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiDiagnosisApi } from '../api/ai-diagnosis.api';

export function useReports(realm?: string) {
  return useQuery({
    queryKey: ['ai-diagnosis', 'reports', realm ?? 'all'],
    queryFn: () => aiDiagnosisApi.reports(realm),
  });
}

export function useReportDetail(realm: string, date: string) {
  return useQuery({
    queryKey: ['ai-diagnosis', 'report', realm, date],
    queryFn: () => aiDiagnosisApi.report(realm, date),
  });
}

export function useUploadStatus(realm: string, days = 7) {
  return useQuery({
    queryKey: ['ai-diagnosis', 'upload-status', realm, days],
    queryFn: () => aiDiagnosisApi.uploadStatus(realm, days),
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ realm, date }: { realm: string; date: string }) => aiDiagnosisApi.removeReport(realm, date),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-diagnosis'] });
    },
  });
}
