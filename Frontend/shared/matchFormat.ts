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

/** Hard ceiling for open-ended fixed-team lists (league season with overlapping rosters). */
export const MAX_OPEN_ENDED_FIXED_TEAMS = 64;

/**
 * League season with `allowUserInMultipleTeams`: players appear on several teams, so the
 * team count is not derivable from `maxParticipants` — organizers add teams manually.
 */
export function hasOpenEndedFixedTeams(game: {
  entityType?: string | null;
  allowUserInMultipleTeams?: boolean | null;
}): boolean {
  return game.entityType === 'LEAGUE_SEASON' && !!game.allowUserInMultipleTeams;
}

/** Upper bound on how many fixed teams a game may store. */
export function fixedTeamSlotLimit(game: {
  maxParticipants: number;
  playersPerMatch?: number | null;
  sport?: Sport | string | null;
  entityType?: string | null;
  allowUserInMultipleTeams?: boolean | null;
}): number {
  const fixedCount = maxFixedTeamSlots(game);
  if (!hasOpenEndedFixedTeams(game) || playersPerTeamOf(game) !== 2) return fixedCount;
  const n = Math.max(0, game.maxParticipants);
  const distinctPairs = (n * (n - 1)) / 2;
  return Math.max(fixedCount, Math.min(distinctPairs, MAX_OPEN_ENDED_FIXED_TEAMS));
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
