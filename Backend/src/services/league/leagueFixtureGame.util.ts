import { ResultsStatus } from '@prisma/client';
import { matchupKeyFromSigs, teamPlayerSig } from './generation/fixedTeamsRoundMatching';

export type LeagueFixtureGameGuardRow = {
  id: string;
  resultsStatus: ResultsStatus;
  timeIsSet: boolean;
  clubId: string | null;
  courtId?: string | null;
  hasOutcomes?: boolean;
};

export function isProtectedLeagueFixtureGame(
  game: LeagueFixtureGameGuardRow,
  options?: { hasNonSystemChat?: boolean }
): boolean {
  if (options?.hasNonSystemChat) return true;
  if (game.resultsStatus !== ResultsStatus.NONE) return true;
  if (game.hasOutcomes) return true;
  if (game.timeIsSet) return true;
  if (game.clubId != null) return true;
  if (game.courtId != null) return true;
  return false;
}

export function isDeletableLeagueFixtureGame(
  game: LeagueFixtureGameGuardRow,
  options?: { hasNonSystemChat?: boolean }
): boolean {
  return !isProtectedLeagueFixtureGame(game, options);
}

/** Higher score wins when two protected games share the same matchup. */
export function protectedFixturePriority(
  game: LeagueFixtureGameGuardRow,
  options?: { hasNonSystemChat?: boolean }
): number {
  if (game.resultsStatus === ResultsStatus.FINAL) {
    return game.hasOutcomes ? 500 : 450;
  }
  if (game.resultsStatus === ResultsStatus.IN_PROGRESS) {
    return game.hasOutcomes ? 400 : 350;
  }
  if (game.timeIsSet && game.clubId != null) return 300;
  if (options?.hasNonSystemChat) return 200;
  if (game.timeIsSet || game.clubId != null || game.courtId != null) return 100;
  return 0;
}

export function assertDeletableBeforeDelete(game: LeagueFixtureGameGuardRow): void {
  if (game.resultsStatus !== ResultsStatus.NONE) {
    throw new Error(`Refusing to delete league game ${game.id}: resultsStatus=${game.resultsStatus}`);
  }
  if (game.hasOutcomes) {
    throw new Error(`Refusing to delete league game ${game.id}: has outcomes`);
  }
  if (game.timeIsSet) {
    throw new Error(`Refusing to delete league game ${game.id}: timeIsSet`);
  }
  if (game.clubId != null) {
    throw new Error(`Refusing to delete league game ${game.id}: clubId set`);
  }
  if (game.courtId != null) {
    throw new Error(`Refusing to delete league game ${game.id}: courtId set`);
  }
}

type FixedTeamShape = {
  teamNumber: number;
  players: { userId: string | null }[];
};

export function matchupKeyFromFixedTeams(fixedTeams: FixedTeamShape[]): string | null {
  if (fixedTeams.length < 2) return null;
  const t1 = fixedTeams.find((t) => t.teamNumber === 1) ?? fixedTeams[0];
  const t2 = fixedTeams.find((t) => t.teamNumber === 2) ?? fixedTeams[1];
  const p0 = t1.players
    .map((p) => p.userId)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  const p1 = t2.players
    .map((p) => p.userId)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  if (p0.length !== 2 || p1.length !== 2) return null;
  return matchupKeyFromSigs(teamPlayerSig(p0), teamPlayerSig(p1));
}
