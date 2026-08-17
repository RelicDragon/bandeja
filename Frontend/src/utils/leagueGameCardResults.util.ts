import type { Game, User } from '@/types';
import type { Round } from '@/types/gameResults';
import { canUserEditResults } from '@/utils/gameResults';
import type { BracketMatchStatus } from '@/utils/leagueBracketMatchStatus';

type Viewer = Pick<User, 'id' | 'isAdmin'> | null;

export function gameHasTechnicalWithdrawal(game: Game): boolean {
  const meta = game.metadata;
  return Boolean(
    meta && typeof meta === 'object' && (meta as Record<string, unknown>).technicalWithdrawal,
  );
}

export function isNonPlayedLeagueFinal(status: BracketMatchStatus | null): boolean {
  return status === 'WALKOVER' || status === 'FORFEIT';
}

export function canStartLeagueFixtureResults(
  game: Game,
  user: Viewer,
  nonPlayedFinal: boolean,
): boolean {
  if (nonPlayedFinal) return false;
  if (game.resultsStatus !== 'NONE') return false;
  return canUserEditResults(game, user);
}

export function canFinishLeagueFixtureResults(
  game: Game,
  user: Viewer,
  rounds: Round[],
  nonPlayedFinal: boolean,
): boolean {
  if (nonPlayedFinal) return false;
  if (game.resultsStatus !== 'IN_PROGRESS') return false;
  if (!canUserEditResults(game, user)) return false;
  return rounds.some((round) =>
    round.matches.some((match) => match.teamA.length > 0 && match.teamB.length > 0),
  );
}

export function canReopenLeagueFixtureResults(
  game: Game,
  user: Viewer,
  nonPlayedFinal: boolean,
): boolean {
  if (nonPlayedFinal) return false;
  if (game.resultsStatus !== 'FINAL') return false;
  if (game.status === 'ARCHIVED') return false;
  if (gameHasTechnicalWithdrawal(game)) return false;
  return canUserEditResults(game, user);
}

export function firstEditableSetIndex(sets: { teamA: number; teamB: number }[]): number {
  const empty = sets.findIndex((set) => set.teamA === 0 && set.teamB === 0);
  if (empty >= 0) return empty;
  return Math.max(0, sets.length - 1);
}
