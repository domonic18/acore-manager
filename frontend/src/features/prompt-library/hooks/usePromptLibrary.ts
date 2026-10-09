import { useQuery } from '@tanstack/react-query';
import { promptLibraryApi } from '../api/prompt-library.api';

export function usePromptLibrary() {
  return useQuery({
    queryKey: ['prompt-library'],
    queryFn: () => promptLibraryApi.get(),
    staleTime: 5 * 60_000,
  });
}
