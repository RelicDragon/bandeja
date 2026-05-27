import { createContext, useContext, type ReactNode } from 'react';
import type { Sport } from '@shared/sport';

const SportLevelContext = createContext<Sport | undefined>(undefined);

export function SportLevelProvider({
  sport,
  children,
}: {
  sport: Sport | undefined;
  children: ReactNode;
}) {
  return <SportLevelContext.Provider value={sport}>{children}</SportLevelContext.Provider>;
}

export function useSportLevelContext(): Sport | undefined {
  return useContext(SportLevelContext);
}
