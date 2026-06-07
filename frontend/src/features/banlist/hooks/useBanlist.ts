import { useQuery } from '@tanstack/react-query';
import { banlistApi } from '../api/banlist.api';

export function useBanlist() {
  return useQuery({
    queryKey: ['banlist'],
    queryFn: () => banlistApi.list(),
  });
}
