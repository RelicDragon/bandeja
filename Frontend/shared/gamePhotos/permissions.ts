export type GamePhotosParticipant = {
  userId: string;
  role?: string;
  status?: string;
};

export type GamePhotosPermissionGame = {
  resultsStatus?: string;
  forbidOthersPhotosView?: boolean;
  participants?: GamePhotosParticipant[] | null;
  parent?: {
    participants?: GamePhotosParticipant[] | null;
  } | null;
};

export type GamePhotosViewer = {
  id: string;
  isAdmin?: boolean;
};

export function isDirectGameParticipant(game: GamePhotosPermissionGame, userId: string): boolean {
  return game.participants?.some((p) => p.userId === userId) ?? false;
}

export function isUserGameAdminOrOwner(game: GamePhotosPermissionGame, userId: string): boolean {
  const isCurrentGameAdminOrOwner = game.participants?.some(
    (p) => p.userId === userId && (p.role === 'OWNER' || p.role === 'ADMIN'),
  );
  if (isCurrentGameAdminOrOwner) return true;
  return game.parent?.participants?.some(
    (p) => p.userId === userId && (p.role === 'OWNER' || p.role === 'ADMIN'),
  ) ?? false;
}

export function canViewGamePhotos(
  game: GamePhotosPermissionGame,
  viewer?: GamePhotosViewer | null,
): boolean {
  if (game.resultsStatus !== 'FINAL') return false;
  if (!game.forbidOthersPhotosView) return true;
  if (!viewer?.id) return false;
  return (
    viewer.isAdmin === true ||
    isDirectGameParticipant(game, viewer.id) ||
    isUserGameAdminOrOwner(game, viewer.id)
  );
}

export function canManageGamePhotos(
  game: GamePhotosPermissionGame,
  viewer: GamePhotosViewer | null | undefined,
): boolean {
  if (!viewer) return false;
  return (
    viewer.isAdmin === true ||
    isUserGameAdminOrOwner(game, viewer.id) ||
    isDirectGameParticipant(game, viewer.id)
  );
}

export function canConfigureGamePhotosPrivacy(
  game: GamePhotosPermissionGame,
  viewer: GamePhotosViewer | null | undefined,
): boolean {
  if (!viewer) return false;
  return viewer.isAdmin === true || isUserGameAdminOrOwner(game, viewer.id);
}
