import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SystemConfigPayload, systemConfigApi } from '../api/system-config.api';

const KEY = ['system-config'];

export function useSystemConfig() {
  return useQuery({ queryKey: KEY, queryFn: () => systemConfigApi.get() });
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

// 供诊断页等消费默认 realm：加载前返回 ''（调用方以 falsy 判断未就绪）
export function useDefaultRealm(): string {
  const { data } = useSystemConfig();
  return data?.defaultRealm ?? '';
}
