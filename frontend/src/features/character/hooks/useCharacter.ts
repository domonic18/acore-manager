import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { characterApi } from '../api/character.api';

export function useCharacterList(params: { page?: number; pageSize?: number; search?: string; includeDeleted?: boolean }) {
  return useQuery({
    queryKey: ['characters', 'list', params],
    queryFn: () => characterApi.list(params),
  });
}

export function useCharacterDetail(guid: number) {
  return useQuery({
    queryKey: ['characters', 'detail', guid],
    queryFn: () => characterApi.detail(guid),
    enabled: guid > 0,
  });
}

export function useUnbanCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (guid: number) => characterApi.unban(guid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}

export function useBanCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ guid, data }: { guid: number; data: { duration: string; reason: string } }) =>
      characterApi.ban(guid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}
