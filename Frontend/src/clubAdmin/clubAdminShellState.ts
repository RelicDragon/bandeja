import { createContext, ReactNode } from 'react';

export interface ClubAdminScreenState {
  title: string;
  backTo: string;
  actions?: ReactNode;
}

export type ClubAdminShellContextValue = {
  screen: ClubAdminScreenState;
  setScreen: (screen: ClubAdminScreenState) => void;
};

export const ClubAdminShellContext = createContext<ClubAdminShellContextValue | null>(null);

export const DEFAULT_CLUB_ADMIN_SCREEN: ClubAdminScreenState = {
  title: '',
  backTo: '/',
};
