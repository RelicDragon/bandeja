import type { LiveRailGame } from '@/api/live';

/**
 * Where a finished rail card leads: the game's results — except a private
 * league fixture the viewer is not in, whose results page 404s for strangers.
 * That viewer lands on the season instead, whose rounds and standings are
 * readable by anyone signed in.
 */
export function finishedRailGamePath(
  game: Pick<LiveRailGame, 'id' | 'isPublic' | 'viewerIsPlaying' | 'league'>,
): string {
  if (!game.isPublic && !game.viewerIsPlaying && game.league) {
    return `/games/${game.league.seasonGameId}`;
  }
  return `/games/${game.id}`;
}
