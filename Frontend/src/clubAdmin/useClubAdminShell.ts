import { useContext, useEffect } from 'react';
import { ClubAdminScreenState, ClubAdminShellContext } from './clubAdminShellState';

export function useClubAdminShell() {
  const ctx = useContext(ClubAdminShellContext);
  if (!ctx) throw new Error('useClubAdminShell must be used within ClubAdminShellProvider');
  return ctx;
}

export function useClubAdminScreen({ title, backTo, actions }: ClubAdminScreenState) {
  const { setScreen } = useClubAdminShell();

  useEffect(() => {
    setScreen({ title, backTo, actions });
  }, [setScreen, title, backTo, actions]);
}
