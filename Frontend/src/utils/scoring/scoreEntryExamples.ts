import type { ScoringRules, SetKind } from './rulebook';
import { isClassicRules, isPointsRules } from './rulebook';

/** Colon-separated example scores for the score-entry modal hint row. */
export function getScoreEntryExampleList(rules: ScoringRules, kind: SetKind): string | null {
  if (kind === 'SUPER_TIEBREAK') {
    const ft = rules.superTieBreakFirstTo;
    const wb = rules.superTieBreakWinBy;
    return `${ft}:${ft - wb}, ${ft + 1}:${ft - 1}, ${ft + 2}:${ft}`;
  }
  if (kind === 'TIEBREAK_GAME') {
    const ft = rules.tieBreakGameFirstTo;
    const wb = rules.tieBreakGameWinBy;
    return `${ft}:${ft - wb}, ${ft + 1}:${ft - 1}, ${ft + 2}:${ft}`;
  }
  if (kind === 'REGULAR' && isClassicRules(rules)) {
    const g = rules.gamesPerSet;
    const tb = rules.tieBreakGameAtGames;
    if (tb === null) return `${g}:0, ${g}:${g - 2}, 0:${g}`;
    return `${g}:${g - 2}, ${tb + 1}:${tb}, 0:${g}`;
  }
  if (kind === 'POINTS' && isPointsRules(rules) && rules.totalPointsPerSet > 0) {
    const tot = rules.totalPointsPerSet;
    const half = Math.floor(tot / 2);
    const hi = half + 1;
    const lo = tot - hi;
    return `${tot}:0, ${hi}:${lo}, ${half}:${tot - half}`;
  }
  if (kind === 'CUSTOM') return null;
  if (kind === 'TIMED') return null;
  return null;
}
