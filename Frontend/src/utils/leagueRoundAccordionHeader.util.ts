import type { LeagueRound } from '@/api/leagues';
import { isBracketPlayoffRound } from '@/utils/leagueBracketRound';

export function leagueRoundHeaderFormatLabelKey(round: LeagueRound): string | null {
  if ((round.roundType ?? 'REGULAR') !== 'PLAYOFF') return null;
  if (isBracketPlayoffRound(round)) {
    return round.bracketScope === 'CROSS_GROUP'
      ? 'gameDetails.roundHeaderSeasonPlayoffBracket'
      : 'gameDetails.roundHeaderBracket';
  }
  return 'gameDetails.roundHeaderSessionPlayoff';
}
