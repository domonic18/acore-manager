import { useMutation } from '@tanstack/react-query';
import { gmToolApi } from '../api/gm-tool.api';

export function useBroadcast() {
  return useMutation({
    mutationFn: (message: string) => gmToolApi.broadcast(message),
  });
}
