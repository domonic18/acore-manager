import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboard.api';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardApi.getStats(),
    refetchInterval: 30 * 1000,
  });
}

export function useHealthDetail() {
  return useQuery({
    queryKey: ['dashboard', 'health'],
    queryFn: () => dashboardApi.getHealthDetail(),
    refetchInterval: 30 * 1000,
  });
}
