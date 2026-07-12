import type { AutomaticSetEntryMode } from '@shared/automaticRelaxedScoring';
import type { ScoringRules, SetKind } from './rulebook';
import { isClassicRules, isClassicTimedRelaxedGameScores, isClassicAutomaticRelaxedScores, isPointsRules } from './rulebook';

/** Colon-separated example scores for the score-entry modal hint row. */
export function getScoreEntryExampleList(
  rules: ScoringRules,
  kind: SetKind,
  automaticEntryMode?: AutomaticSetEntryMode | null,
): string | null {
  if (automaticEntryMode === 'SUPER_TIEBREAK' || kind === 'SUPER_TIEBREAK') {
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
    if (isClassicAutomaticRelaxedScores(rules)) {
      if (automaticEntryMode === 'AMERICANO_POINTS') {
        const budget =
          rules.maxPointsPerTeam > 0
            ? rules.maxPointsPerTeam * 2
            : rules.totalPointsPerSet > 0
              ? rules.totalPointsPerSet
              : 24;
        const half = Math.floor(budget / 2);
        const hi = half + 2;
        const lo = budget - hi;
        return `${hi}:${lo}, ${half + 1}:${half - 1}, ${budget}:0`;
      }
      return '6:4, 7:5, 10:8';
    }
    if (isClassicTimedRelaxedGameScores(rules)) return '6:4, 4:4, 3:6';
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
  if (kind === 'POINTS' && (rules.winBy >= 2 && rules.totalPointsPerSet > 0)) {
    const t = rules.totalPointsPerSet;
    return `${t}:${t - 2}, ${t + 1}:${t - 1}, 0:${t}`;
  }
  if (kind === 'CUSTOM') return null;
  if (kind === 'TIMED') return null;
  return null;
}
