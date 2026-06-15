import type { Court, Game } from '@/types';

export function getGamePlayedCourts(game: Game, courts: Court[] = []): Court[] {
  const fromGame: Court[] = [];

  if (game.gameCourts?.length) {
    for (const gc of game.gameCourts) {
      if (gc.court) fromGame.push(gc.court);
    }
  } else if (game.court) {
    fromGame.push(game.court);
  }

  const seen = new Set<string>();
  return fromGame
    .map((court) => courts.find((c) => c.id === court.id) ?? court)
    .filter((court) => {
      if (seen.has(court.id)) return false;
      seen.add(court.id);
      return true;
    });
}

export function getGamePlayedCourtsWithWebCamera(game: Game, courts: Court[] = []): Court[] {
  return getGamePlayedCourts(game, courts).filter((court) => Boolean(court.webCameraUrl?.trim()));
}
