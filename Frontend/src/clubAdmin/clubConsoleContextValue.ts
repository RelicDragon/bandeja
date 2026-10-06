import { createContext, useContext } from 'react';
import type { ClubAdminCapability } from '@shared/clubAdmin/contract';
import type { ConsoleContext } from '@/queries/clubAdmin';

export interface ClubConsoleValue {
  clubId: string;
  context: ConsoleContext;
  timeZone: string;
  /** Club-local `yyyy-MM-dd` of now. */
  today: string;
  /** `Date.now()` rounded to the minute; drives "now" lines and past-slot dimming. */
  nowMs: number;
  can: (capability: ClubAdminCapability) => boolean;
  isV2: boolean;
}

export const ClubConsoleCtx = createContext<ClubConsoleValue | null>(null);

export function useClubConsole(): ClubConsoleValue {
  const v = useContext(ClubConsoleCtx);
  if (!v) throw new Error('useClubConsole must be used inside ClubConsoleProvider');
  return v;
}
