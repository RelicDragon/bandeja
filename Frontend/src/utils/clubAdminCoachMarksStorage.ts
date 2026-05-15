const LS_KEY = 'padelpulse-club-admin-coach-v1';

export type ClubAdminCoachStep = 'schedule' | 'tapSlot' | 'settings';

export interface ClubAdminCoachMarksState {
  schedule: boolean;
  tapSlot: boolean;
  settings: boolean;
}

const defaultState = (): ClubAdminCoachMarksState => ({
  schedule: false,
  tapSlot: false,
  settings: false,
});

export function readClubAdminCoachMarks(): ClubAdminCoachMarksState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<ClubAdminCoachMarksState>;
    return {
      schedule: Boolean(parsed.schedule),
      tapSlot: Boolean(parsed.tapSlot),
      settings: Boolean(parsed.settings),
    };
  } catch {
    return defaultState();
  }
}

export function markClubAdminCoachStep(step: ClubAdminCoachStep): void {
  const state = readClubAdminCoachMarks();
  state[step] = true;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function allClubAdminCoachMarksDone(): boolean {
  const s = readClubAdminCoachMarks();
  return s.schedule && s.tapSlot && s.settings;
}
