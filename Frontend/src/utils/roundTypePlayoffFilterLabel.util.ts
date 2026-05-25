import type { LeagueRound } from '@/api/leagues';
import { isBracketPlayoffRound } from '@/utils/leagueBracketRound';

export type PlayoffFilterLabelMode = 'bracket' | 'session' | 'mixed';

export function resolvePlayoffFilterLabelMode(rounds: readonly LeagueRound[]): PlayoffFilterLabelMode {
  const playoffRounds = rounds.filter((r) => (r.roundType ?? 'REGULAR') === 'PLAYOFF');
  if (playoffRounds.length === 0) return 'session';

  const hasBracket = playoffRounds.some(isBracketPlayoffRound);
  const hasSession = playoffRounds.some((r) => !isBracketPlayoffRound(r));
  if (hasBracket && hasSession) return 'mixed';
  if (hasBracket) return 'bracket';
  return 'session';
}

export function playoffRoundTypeFilterLabelKey(mode: PlayoffFilterLabelMode): string {
  switch (mode) {
    case 'bracket':
      return 'gameDetails.roundTypePlayoffBracket';
    case 'mixed':
      return 'gameDetails.roundTypePlayoffMixed';
    default:
      return 'gameDetails.roundTypePlayoffSession';
  }
}
