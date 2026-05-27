import { createContext, useContext } from 'react';
import type { Sport } from '@shared/sport';

export const SportLevelContext = createContext<Sport | undefined>(undefined);

export function useSportLevelContext(): Sport | undefined {
  return useContext(SportLevelContext);
}
