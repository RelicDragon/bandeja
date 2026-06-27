import type { StoryResultMatch } from '@/api/stories';
import type { WinnerOfGame } from '@/types';

export function computeSetsRecord(matches: StoryResultMatch[]): { won: number; lost: number } {
  let won = 0;
  let lost = 0;
  for (const match of matches) {
    for (const set of match.sets) {
      if (set.myScore > set.oppScore) won += 1;
      if (set.myScore < set.oppScore) lost += 1;
    }
  }
  return { won, lost };
}

export function isScoresDeltaFormat(winnerOfGame?: WinnerOfGame | null): boolean {
  return winnerOfGame === 'BY_SCORES_DELTA';
}

export function isScoresMadeFormat(winnerOfGame?: WinnerOfGame | null): boolean {
  return winnerOfGame === 'BY_SCORES_MADE';
}

export function isPointsFormat(winnerOfGame?: WinnerOfGame | null): boolean {
  return winnerOfGame === 'BY_POINTS';
}

export function isMatchWinFormat(winnerOfGame?: WinnerOfGame | null): boolean {
  return !winnerOfGame || winnerOfGame === 'BY_MATCHES_WON' || winnerOfGame === 'PLAYOFF_FINALS';
}
