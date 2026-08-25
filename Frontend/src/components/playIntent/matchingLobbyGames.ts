import type { MatchingLobbyGame } from '@/api/playIntents';

export function visibleMatchingGames(
  games: MatchingLobbyGame[] | undefined,
  options: { looking: boolean; hasProposal: boolean },
): MatchingLobbyGame[] {
  if (!options.looking || options.hasProposal) return [];
  return games ?? [];
}

export function matchingGamesKey(games: MatchingLobbyGame[] | undefined) {
  return (games ?? [])
    .map(
      (game) =>
        `${game.id}:${game.allowDirectJoin ? 1 : 0}:${game.playingCount}:${game.maxParticipants}:${game.timeLabel}:${game.entityType}`,
    )
    .join('|');
}

export function matchingGamesOrbitKey(games: MatchingLobbyGame[] | undefined) {
  return (games ?? []).map((game) => game.id).join('|');
}

export function matchingGameFaces(game: MatchingLobbyGame) {
  if (game.playingAvatars.length > 0) return game.playingAvatars;
  return game.ownerAvatar ? [game.ownerAvatar] : [];
}

export function matchingGameInitials(face: {
  firstName: string | null;
  lastName: string | null;
}): string {
  const a = (face.firstName || '').charAt(0);
  const b = (face.lastName || '').charAt(0);
  return (a + b).toUpperCase() || '?';
}
