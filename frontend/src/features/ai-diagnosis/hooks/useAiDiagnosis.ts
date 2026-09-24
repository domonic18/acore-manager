import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiDiagnosisApi } from '../api/ai-diagnosis.api';
import { gmMailApi } from '@/shared/api/gm-mail';

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

export function useUpdateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ realm, date, patch }: { realm: string; date: string; patch: { gmRemark?: string; contentMarkdown?: string } }) =>
      aiDiagnosisApi.updateReport(realm, date, patch),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['ai-diagnosis', 'report', vars.realm, vars.date] });
      void queryClient.invalidateQueries({ queryKey: ['ai-diagnosis', 'reports'] });
    },
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ realm, date }: { realm: string; date: string }) => aiDiagnosisApi.removeReport(realm, date),
    onSuccess: () => {
      // 只失效列表：详情查询此时仍挂在详情页上，若一并失效会对已删除的报告发 GET（404 报错）
      void queryClient.invalidateQueries({ queryKey: ['ai-diagnosis', 'reports'] });
    },
  });
}

export function useExemptionsByGuids(guids: number[]) {
  return useQuery({
    queryKey: ['ai-diagnosis', 'exemptions', 'guids', guids],
    queryFn: () => aiDiagnosisApi.exemptionsByGuids(guids),
    enabled: guids.length > 0,
  });
}

export function useViolationTypes() {
  return useQuery({
    queryKey: ['ai-diagnosis', 'exemption-types'],
    queryFn: () => aiDiagnosisApi.violationTypes(),
    staleTime: Infinity,
  });
}

export function useCreateExemption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiDiagnosisApi.createExemption,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-diagnosis', 'exemptions'] });
    },
  });
}

export function useMailTemplate(enabled: boolean) {
  return useQuery({
    queryKey: ['ai-diagnosis', 'mail-template'],
    queryFn: () => gmMailApi.template(),
    enabled,
    staleTime: Infinity,
  });
}

export function useSendWarningMail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: gmMailApi.send,
    onSuccess: () => {
      // 已警告徽标来自报告详情响应层富化，发送成功后刷新详情
      void queryClient.invalidateQueries({ queryKey: ['ai-diagnosis', 'report'] });
    },
  });
}
