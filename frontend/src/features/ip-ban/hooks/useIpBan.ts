import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ipBanApi } from '../api/ip-ban.api';

export function useIpBanList(params: { page?: number; pageSize?: number; search?: string }) {
  return useQuery({
    queryKey: ['ip-bans', 'list', params],
    queryFn: () => ipBanApi.list(params),
  });
}

export function useBanIp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { ip: string; duration: string; reason: string }) =>
      ipBanApi.ban(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-bans'] });
    },
  });
}

export function useUnbanIp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ip: string) => ipBanApi.unban(ip),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-bans'] });
    },
  });
}
