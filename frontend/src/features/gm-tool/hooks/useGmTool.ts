import { useMutation } from '@tanstack/react-query';
import { gmToolApi } from '../api/gm-tool.api';

export function useBroadcast() {
  return useMutation({
    mutationFn: (message: string) => gmToolApi.broadcast(message),
  });
}

export function useSendItems() {
  return useMutation({
    mutationFn: (data: { playerName: string; itemId: number; count?: number }) =>
      gmToolApi.sendItems(data.playerName, data.itemId, data.count),
  });
}

export function useFindPlayer() {
  return useMutation({
    mutationFn: (name: string) => gmToolApi.findPlayer(name),
  });
}
