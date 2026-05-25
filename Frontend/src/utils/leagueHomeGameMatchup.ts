import type { BasicUser, Game, GameTeam } from '@/types';

export type LeagueHomeGameMatchup = {
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

  const teammates = (myTeam.players ?? [])
    .filter((p) => p.userId !== userId && p.user)
    .map((p) => p.user!);
  const opponents = (opponentTeam.players ?? [])
    .filter((p) => p.user)
    .map((p) => p.user!);
  const opponentTeamName = opponentTeam.name?.trim() || undefined;

  if (teammates.length === 0 && opponents.length === 0 && !opponentTeamName) return null;
  return { teammates, opponents, opponentTeamName };
}

function matchupFromParticipants(game: Game, userId: string): LeagueHomeGameMatchup | null {
  const playing = (game.participants ?? []).filter(
    (p) => p.status === 'PLAYING' && p.user
  );
  if (playing.length < 2) return null;

  const userIndex = playing.findIndex((p) => p.userId === userId);
  if (userIndex < 0) return null;

  const mid = Math.floor(playing.length / 2);
  const onFirstSide = userIndex < mid;
  const mySide = onFirstSide ? playing.slice(0, mid) : playing.slice(mid);
  const oppSide = onFirstSide ? playing.slice(mid) : playing.slice(0, mid);

  const teammates = mySide.filter((p) => p.userId !== userId).map((p) => p.user!);
  const opponents = oppSide.map((p) => p.user!);
  if (teammates.length === 0 && opponents.length === 0) return null;
  return { teammates, opponents };
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
