import { useQuery } from '@tanstack/react-query';
import { muteApi } from '../api/mute.api';

export function useMuteList() {
  return useQuery({
    queryKey: ['mutes', 'list'],
    queryFn: () => muteApi.list(),
  });
}
