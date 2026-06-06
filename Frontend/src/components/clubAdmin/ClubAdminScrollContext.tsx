import { createContext, RefObject, useContext } from 'react';

export const ClubAdminScrollContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function useClubAdminScrollContainer() {
  return useContext(ClubAdminScrollContext);
}
