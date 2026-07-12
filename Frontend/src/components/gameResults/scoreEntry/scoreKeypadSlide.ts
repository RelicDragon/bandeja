import type { Variants } from 'framer-motion';

export type KeypadSlideDirection = -1 | 0 | 1;

/** Pause after a pick so the selected cell highlights before slide/close. */
export const KEYPAD_SELECTION_CONFIRM_MS = 320;

const SLIDE_EASE = [0.32, 0.72, 0, 1] as const;

export function resolveKeypadSlideDirection(
  previousTeam: 'teamA' | 'teamB',
  nextTeam: 'teamA' | 'teamB',
): KeypadSlideDirection {
  if (previousTeam === nextTeam) return 0;
  return nextTeam === 'teamB' ? 1 : -1;
}

export function otherPickerTeam(team: 'teamA' | 'teamB'): 'teamA' | 'teamB' {
  return team === 'teamA' ? 'teamB' : 'teamA';
}

export function resolveKeypadTeamAfterPick(params: {
  pickedTeam: 'teamA' | 'teamB';
  firstPickDone: boolean;
  isPaired: boolean;
}): 'teamA' | 'teamB' | null {
  if (params.isPaired) return null;
  if (!params.firstPickDone) return otherPickerTeam(params.pickedTeam);
  return null;
}

export const keypadTeamSlideVariants: Variants = {
  enter: (dir: KeypadSlideDirection) => ({
    x: dir === 0 ? 0 : dir > 0 ? '100%' : '-100%',
    opacity: dir === 0 ? 1 : 0.88,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.28, ease: SLIDE_EASE },
  },
  exit: (dir: KeypadSlideDirection) => ({
    x: dir === 0 ? 0 : dir > 0 ? '-100%' : '100%',
    opacity: dir === 0 ? 1 : 0.88,
    transition: { duration: 0.28, ease: SLIDE_EASE },
  }),
};
