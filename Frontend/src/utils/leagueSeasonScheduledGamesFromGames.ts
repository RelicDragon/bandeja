import type { Game } from '@/types';

function hubIdForLeagueGame(game: Game): string | null {
  if (game.parent?.leagueSeason) return game.parent.id;
  if (game.parentId) return game.parentId;
  if (game.leagueSeason?.id) return game.leagueSeason.id;
  return null;
}

type LeagueSeasonGamesTimeFilter = 'scheduled' | 'unscheduled';

function leagueSeasonParticipantGamesFromGames(
  games: readonly Game[],
  userId: string | null | undefined,
  timeFilter: LeagueSeasonGamesTimeFilter
): Record<string, Game[]> {
  const result: Record<string, Game[]> = {};
  if (!userId) return result;
  for (const game of games) {
    if (game.entityType !== 'LEAGUE') continue;
    if (game.status !== 'ANNOUNCED' && game.status !== 'STARTED') continue;
    if (timeFilter === 'scheduled') {
      if (game.timeIsSet !== true) continue;
    } else if (game.timeIsSet === true) {
      continue;
    }
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
    if (timeFilter === 'scheduled') {
      result[id].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
    } else {
      result[id].sort((a, b) => {
        const ra = a.leagueRound?.orderIndex ?? 0;
        const rb = b.leagueRound?.orderIndex ?? 0;
        if (ra !== rb) return ra - rb;
        const playInA = a.bracketSlot?.slotKind === 'PLAY_IN' ? 0 : 1;
        const playInB = b.bracketSlot?.slotKind === 'PLAY_IN' ? 0 : 1;
        if (playInA !== playInB) return playInA - playInB;
        return a.id.localeCompare(b.id);
      });
    }
  }
  return result;
}

export function leagueSeasonScheduledGamesFromGames(
  games: readonly Game[],
  userId: string | null | undefined
): Record<string, Game[]> {
  return leagueSeasonParticipantGamesFromGames(games, userId, 'scheduled');
}

export function leagueSeasonUnscheduledGamesFromGames(
  games: readonly Game[],
  userId: string | null | undefined
): Record<string, Game[]> {
  return leagueSeasonParticipantGamesFromGames(games, userId, 'unscheduled');
}
