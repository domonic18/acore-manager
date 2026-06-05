import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountApi } from '../api/account.api';

export function useAccountList(params: { page?: number; pageSize?: number; search?: string }) {
  return useQuery({
    queryKey: ['accounts', 'list', params],
    queryFn: () => accountApi.list(params),
  });
}

export function useAccountDetail(id: number) {
  return useQuery({
    queryKey: ['accounts', 'detail', id],
    queryFn: () => accountApi.detail(id),
    enabled: id > 0,
  });
}

export function useAccountCharacters(id: number) {
  return useQuery({
    queryKey: ['accounts', 'characters', id],
    queryFn: () => accountApi.characters(id),
    enabled: id > 0,
  });
}

export function useUnbanAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => accountApi.unban(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
