import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ModelConfigPayload,
  modelConfigApi,
} from '../api/model-config.api';

export function useModelConfigs() {
  return useQuery({
    queryKey: ['model-configs'],
    queryFn: () => modelConfigApi.list(),
  });
}

export function useCreateModelConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ModelConfigPayload) => modelConfigApi.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['model-configs'] }),
  });
}

export function useUpdateModelConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<ModelConfigPayload> }) =>
      modelConfigApi.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['model-configs'] }),
  });
}

export function useDeleteModelConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => modelConfigApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['model-configs'] }),
  });
}

export function useSetDefaultModelConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => modelConfigApi.setDefault(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['model-configs'] }),
  });
}

export function useTestModelConfig() {
  return useMutation({
    mutationFn: (id: number) => modelConfigApi.test(id),
  });
}
