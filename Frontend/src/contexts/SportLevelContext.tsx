import { useEffect, type ReactNode } from 'react';
import type { Sport } from '@shared/sport';
import { useNavigationStore } from '@/store/navigationStore';
import { SportLevelContext } from './useSportLevelContext';

export function SportLevelProvider({
  sport,
  children,
}: {
  sport: Sport | undefined;
  children: ReactNode;
}) {
  const pushActiveLevelSport = useNavigationStore((s) => s.pushActiveLevelSport);
  const popActiveLevelSport = useNavigationStore((s) => s.popActiveLevelSport);

  useEffect(() => {
    if (!sport) return;
    pushActiveLevelSport(sport);
    return () => popActiveLevelSport(sport);
  }, [sport, pushActiveLevelSport, popActiveLevelSport]);

  return <SportLevelContext.Provider value={sport}>{children}</SportLevelContext.Provider>;
}
