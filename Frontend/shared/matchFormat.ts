/** Keep in sync with Backend/src/shared/matchFormat.ts */
import { parseSport, type Sport } from './sport';
import { DEFAULT_PLAYERS_PER_MATCH_BY_SPORT } from './sportRegistryDefaults';

export type PlayersPerMatch = 2 | 4;

export type MatchFormatGame = {
  playersPerMatch?: number | null;
  sport?: Sport | string | null;
};

export function playersPerMatchOf(game: MatchFormatGame): PlayersPerMatch {
  const n = game.playersPerMatch;
  if (n === 2 || n === 4) return n;
  return DEFAULT_PLAYERS_PER_MATCH_BY_SPORT[parseSport(game.sport)];
}

export function playersPerTeamOf(game: MatchFormatGame): number {
  return playersPerMatchOf(game) / 2;
}

export function maxFixedTeamSlots(game: {
  maxParticipants: number;
  playersPerMatch?: number | null;
  sport?: Sport | string | null;
}): number {
  const perTeam = playersPerTeamOf(game);
  if (perTeam < 1) return 0;
  return Math.floor(game.maxParticipants / perTeam);
}

export function maxPlayersPerTeamForGame(
  game: MatchFormatGame | null | undefined,
  participantCount?: number,
): number {
  if (game?.playersPerMatch === 2 || game?.playersPerMatch === 4) {
    return game.playersPerMatch / 2;
  }
  if (participantCount === 2) return 1;
  return playersPerMatchOf(game ?? {}) / 2;
}
