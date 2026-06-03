import type { BasicUser, Game, GameTeam } from '@/types';
import { maxPlayersPerTeamForGame } from '@/utils/matchFormat';

function usersFromTeam(team: GameTeam): BasicUser[] {
  return (team.players ?? []).filter((p) => p.user).map((p) => p.user!);
}

export function resolveLeagueGameCardTeams(game: Game): {
  teamA: BasicUser[];
  teamB: BasicUser[];
} {
  const participantCount = (game.participants ?? []).filter((p) => p.status === 'PLAYING').length;
  const maxPerTeam = maxPlayersPerTeamForGame(game, participantCount || undefined);
  const teams = game.fixedTeams ?? [];
  if (teams.length >= 2) {
    const sorted = [...teams].sort((a, b) => a.teamNumber - b.teamNumber);
    return {
      teamA: usersFromTeam(sorted[0]).slice(0, maxPerTeam),
      teamB: usersFromTeam(sorted[1]).slice(0, maxPerTeam),
    };
  }

  const playing = (game.participants ?? []).filter((p) => p.status === 'PLAYING' && p.user);
  const mid = Math.floor(playing.length / 2);
  return {
    teamA: playing.slice(0, mid).map((p) => p.user!).slice(0, maxPerTeam),
    teamB: playing.slice(mid).map((p) => p.user!).slice(0, maxPerTeam),
  };
}
