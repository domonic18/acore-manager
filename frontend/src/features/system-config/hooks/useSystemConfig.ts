import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SystemConfig, systemConfigReadApi } from '@/shared/api/system-config.api';
import { SystemConfigPayload, systemConfigApi } from '../api/system-config.api';

const KEY = ['system-config'];

export function useSystemConfig() {
  return useQuery({ queryKey: KEY, queryFn: systemConfigReadApi.get });
}

export function useUpdateSystemConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SystemConfigPayload) => systemConfigApi.update(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSoapTest() {
  return useMutation({ mutationFn: () => systemConfigApi.soapTest() });
}

export type { SystemConfig };
