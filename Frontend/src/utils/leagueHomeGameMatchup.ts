import type { BasicUser, Game, GameTeam } from '@/types';
import { formatFixtureMatrixPlayerName } from '@/utils/leagueFixtureMatrix';

export type LeagueHomeOpponentRowDisplay =
  | { kind: 'teamName'; label: string }
  | { kind: 'players'; primary: string; partners: string[] };

export type LeagueHomeGameMatchup = {
  self: BasicUser;
  teammates: BasicUser[];
  opponents: BasicUser[];
  opponentTeamName?: string;
};

function matchupFromFixedTeams(
  teams: GameTeam[],
  userId: string
): LeagueHomeGameMatchup | null {
  const sorted = [...teams].sort((a, b) => a.teamNumber - b.teamNumber);
  if (sorted.length < 2) return null;

  const myTeam = sorted.find((t) => (t.players ?? []).some((p) => p.userId === userId));
  const opponentTeam = sorted.find((t) => t !== myTeam);
  if (!myTeam || !opponentTeam) return null;

  const self = (myTeam.players ?? []).find((p) => p.userId === userId)?.user;
  if (!self) return null;

  const teammates = (myTeam.players ?? [])
    .filter((p) => p.userId !== userId && p.user)
    .map((p) => p.user!);
  const opponents = (opponentTeam.players ?? [])
    .filter((p) => p.user)
    .map((p) => p.user!);
  const opponentTeamName = opponentTeam.name?.trim() || undefined;

  if (teammates.length === 0 && opponents.length === 0 && !opponentTeamName) return null;
  return { self, teammates, opponents, opponentTeamName };
}

function matchupFromParticipants(game: Game, userId: string): LeagueHomeGameMatchup | null {
  const playing = (game.participants ?? []).filter(
    (p) => p.status === 'PLAYING' && p.user
  );
  if (playing.length < 2) return null;

  const userIndex = playing.findIndex((p) => p.userId === userId);
  if (userIndex < 0) return null;

  const self = playing[userIndex].user!;
  const mid = Math.floor(playing.length / 2);
  const onFirstSide = userIndex < mid;
  const mySide = onFirstSide ? playing.slice(0, mid) : playing.slice(mid);
  const oppSide = onFirstSide ? playing.slice(mid) : playing.slice(0, mid);

  const teammates = mySide.filter((p) => p.userId !== userId).map((p) => p.user!);
  const opponents = oppSide.map((p) => p.user!);
  if (teammates.length === 0 && opponents.length === 0) return null;
  return { self, teammates, opponents };
}

/** Row 2 label: one name for singles; `pl1 with pl2` for doubles+. */
export function getLeagueHomeOpponentRowDisplay(
  opponents: BasicUser[],
  opponentTeamName: string | undefined
): LeagueHomeOpponentRowDisplay {
  if (opponentTeamName) return { kind: 'teamName', label: opponentTeamName };
  const names = opponents.map((u) => formatFixtureMatrixPlayerName(u)).filter(Boolean);
  if (names.length <= 1) {
    return { kind: 'players', primary: names[0] ?? '', partners: [] };
  }
  const [primary, ...partners] = names;
  return { kind: 'players', primary, partners };
}

export function getLeagueHomeGameMatchup(
  game: Game,
  userId: string | null | undefined
): LeagueHomeGameMatchup | null {
  if (!userId) return null;
  const teams = game.fixedTeams ?? [];
  if (teams.length >= 2) {
    return matchupFromFixedTeams(teams, userId);
  }
  return matchupFromParticipants(game, userId);
}
