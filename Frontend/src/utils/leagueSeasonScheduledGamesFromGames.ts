import type { Game } from '@/types';

function hubIdForLeagueGame(game: Game): string | null {
  if (game.parent?.leagueSeason) return game.parent.id;
  if (game.parentId) return game.parentId;
  if (game.leagueSeason?.id) return game.leagueSeason.id;
  return null;
}

export function leagueSeasonScheduledGamesFromGames(
  games: readonly Game[],
  userId: string | null | undefined
): Record<string, Game[]> {
  const result: Record<string, Game[]> = {};
  if (!userId) return result;
  for (const game of games) {
    if (game.entityType !== 'LEAGUE') continue;
    if (game.status !== 'ANNOUNCED' && game.status !== 'STARTED') continue;
    if (game.timeIsSet !== true) continue;
    const isParticipant = (game.participants ?? []).some(
      (p) => p.userId === userId && p.status === 'PLAYING'
    );
    if (!isParticipant) continue;
    const hubId = hubIdForLeagueGame(game);
    if (!hubId) continue;
    if (!result[hubId]) result[hubId] = [];
    result[hubId].push(game);
  }
  for (const id of Object.keys(result)) {
    result[id].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }
  return result;
}
