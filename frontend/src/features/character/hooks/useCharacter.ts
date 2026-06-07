import { useQuery } from '@tanstack/react-query';
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
