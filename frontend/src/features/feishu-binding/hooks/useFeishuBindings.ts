import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { feishuBindingApi } from '../api/feishu-binding.api';

export function useFeishuBindings() {
  return useQuery({
    queryKey: ['feishu-bindings'],
    queryFn: feishuBindingApi.list,
  });
}

export function useCreateFeishuBinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: feishuBindingApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feishu-bindings'] });
    },
  });
}

export function useRemoveFeishuBinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: feishuBindingApi.remove,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feishu-bindings'] });
    },
  });
}
