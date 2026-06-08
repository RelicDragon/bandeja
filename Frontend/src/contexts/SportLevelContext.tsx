import { useEffect, type ReactNode } from 'react';
import type { Sport } from '@shared/sport';
import { useSportContextStore } from '@/store/sportContextStore';
import { SportLevelContext } from './useSportLevelContext';

export function SportLevelProvider({
  sport,
  children,
}: {
  sport: Sport | undefined;
  children: ReactNode;
}) {
  const pushActiveLevelSport = useSportContextStore((s) => s.pushActiveLevelSport);
  const popActiveLevelSport = useSportContextStore((s) => s.popActiveLevelSport);

  useEffect(() => {
    if (!sport) return;
    pushActiveLevelSport(sport);
    return () => popActiveLevelSport(sport);
  }, [sport, pushActiveLevelSport, popActiveLevelSport]);

  return <SportLevelContext.Provider value={sport}>{children}</SportLevelContext.Provider>;
}
