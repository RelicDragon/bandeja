import { ReactNode, useCallback, useMemo, useState } from 'react';
import {
  ClubAdminScreenState,
  ClubAdminShellContext,
  DEFAULT_CLUB_ADMIN_SCREEN,
} from './clubAdminShellState';

export function ClubAdminShellProvider({ children }: { children: ReactNode }) {
  const [screen, setScreenState] = useState<ClubAdminScreenState>(DEFAULT_CLUB_ADMIN_SCREEN);
  const setScreen = useCallback((next: ClubAdminScreenState) => {
    setScreenState(next);
  }, []);

  const value = useMemo(() => ({ screen, setScreen }), [screen, setScreen]);

  return <ClubAdminShellContext.Provider value={value}>{children}</ClubAdminShellContext.Provider>;
}
