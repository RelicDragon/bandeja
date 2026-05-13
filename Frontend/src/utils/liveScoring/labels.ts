import type { SetResult } from '@/types/gameResults';
import type { ScoringRules } from '@/utils/scoring';
import { isSupplementalMatchSet } from '@/utils/matchSetRole';

export type LiveSetLabelKind = 'REGULAR' | 'TIE_BREAK' | 'SUPER_TIE_BREAK' | 'EXTRA';

export type LiveSetLabel = {
  kind: LiveSetLabelKind;
  setOneBased: number;
};

/** Format-aware label classification for a live-scoring set row.
 *  Mirrors `getSetKind` for official rows but only uses persisted row data + rules so it can be
 *  evaluated cheaply per column without touching the full results display layer. */
export const liveSetLabelForRow = (set: SetResult, setIndex: number, rules: ScoringRules): LiveSetLabel => {
  const setOneBased = setIndex + 1;
  if (isSupplementalMatchSet(set)) return { kind: 'EXTRA', setOneBased };
  if (set.isTieBreak) {
    if (rules.superTieBreakReplacesDeciderAtIndex === setIndex) {
      return { kind: 'SUPER_TIE_BREAK', setOneBased };
    }
    return { kind: 'TIE_BREAK', setOneBased };
  }
  return { kind: 'REGULAR', setOneBased };
};
