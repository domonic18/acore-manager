import { useAuth } from './useAuth';

export function usePermission() {
  const { user } = useAuth();

  const hasGmLevel = (minLevel: number): boolean => {
    return (user?.gmlevel ?? 0) >= minLevel;
  };

  return {
    hasGmLevel,
    gmlevel: user?.gmlevel ?? 0,
  };
}
