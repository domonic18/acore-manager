import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiAssistantApi } from '../api/ai-assistant.api';

export function useChatSessions() {
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ['ai-chat-sessions'], queryFn: () => aiAssistantApi.listSessions() });

  const create = useMutation({
    mutationFn: (title?: string) => aiAssistantApi.createSession(title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-chat-sessions'] }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => aiAssistantApi.deleteSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-chat-sessions'] }),
  });

  return { sessions, create, remove };
}
