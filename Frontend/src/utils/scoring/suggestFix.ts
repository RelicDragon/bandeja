import type { SetResult } from '@/types/gameResults';
import type { ScoringRules } from './rulebook';
import { isLegalSetScore } from './validateSet';

export interface ScoreSuggestion {
  teamA: number;
  teamB: number;
  isTieBreak?: boolean;
}

export const suggestLegalScores = (
  a: number,
  b: number,
  rules: ScoringRules,
  setIndex: number,
  sets: SetResult[]
): ScoreSuggestion[] => {
  const suggestions: ScoreSuggestion[] = [];
  const target = rules.gamesPerSet;
  const tb = rules.tieBreakGameAtGames;

  const winningSide: 'A' | 'B' | null = a > b ? 'A' : b > a ? 'B' : null;

  const pushIfLegal = (ta: number, tb2: number, isTieBreak?: boolean) => {
    const check = isLegalSetScore(ta, tb2, rules, setIndex, sets, isTieBreak);
    if (check.ok) suggestions.push({ teamA: ta, teamB: tb2, isTieBreak });
  };

  if (rules.ballsInGames && rules.winnerOfMatch === 'BY_SETS' && target > 0) {
    if (winningSide === 'A') {
      pushIfLegal(target, Math.min(b, target - 2));
      if (tb !== null) {
        pushIfLegal(tb + 1, tb);
        pushIfLegal(target + 1, tb - 1);
      }
    } else if (winningSide === 'B') {
      pushIfLegal(Math.min(a, target - 2), target);
      if (tb !== null) {
        pushIfLegal(tb, tb + 1);
        pushIfLegal(tb - 1, target + 1);
      }
    }
  }

  if (rules.totalPointsPerSet > 0 && rules.winnerOfMatch === 'BY_SCORES') {
    const total = rules.totalPointsPerSet;
    if (winningSide === 'A') {
      pushIfLegal(Math.max(Math.ceil(total / 2) + 1, a), total - Math.max(Math.ceil(total / 2) + 1, a));
    } else if (winningSide === 'B') {
      pushIfLegal(total - Math.max(Math.ceil(total / 2) + 1, b), Math.max(Math.ceil(total / 2) + 1, b));
    }
  }

  const seen = new Set<string>();
  return suggestions.filter((s) => {
    const key = `${s.teamA}:${s.teamB}:${s.isTieBreak ? 'tb' : ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
};
