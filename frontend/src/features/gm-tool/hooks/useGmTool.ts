import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gmToolApi } from '../api/gm-tool.api';
import { gmMailApi } from '@/shared/api/gm-mail';

export function useBroadcast() {
  return useMutation({
    mutationFn: (message: string) => gmToolApi.broadcast(message),
  });
}

export function useMailTemplates() {
  return useQuery({
    queryKey: ['gm-tool', 'mail-templates'],
    queryFn: () => gmMailApi.templates(),
    staleTime: Infinity,
  });
}

export function useNameSuggest(prefix: string) {
  return useQuery({
    queryKey: ['gm-tool', 'name-suggest', prefix],
    queryFn: () => gmMailApi.suggestNames(prefix),
    enabled: prefix.trim().length >= 1,
    staleTime: 60_000,
  });
}

export function useSendMail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: gmMailApi.send,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gm-tool', 'mail-logs'] });
    },
  });
}

export function useMailLogs(page: number, target?: string) {
  return useQuery({
    queryKey: ['gm-tool', 'mail-logs', page, target ?? ''],
    queryFn: () => gmMailApi.logs(page, target),
  });
}
