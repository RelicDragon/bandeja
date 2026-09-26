/**
 * PRD 349 — whether a viewer sees the Live block instead of the results entry area.
 */

import type { Game } from '@/types';

/**
 * PRD 349 — the **Live** block on game details.
 *
 * Shown instead of the results-entry area to a non-participant looking at a
 * rail-visible game (public, or a public season's league fixture) that is
 * being scored right now: a compact score summary and one
 * large **Watch live** button. Participants keep their scoring entry untouched.
 *
 * The score summary carries the same `layoutId` as the rail card, so arriving
 * here from the rail keeps the shared-element transition intact.
 */

/**
 * True when this viewer should see the Live block instead of results entry.
 *
 * Deliberately decided from the **game-detail payload alone** — no score, no
 * request — so the extra fetch below only happens for the handful of viewers
 * who will actually see the block. The server re-checks all three conditions
 * before it hands out a summary or a token.
 */
type RailVisibilityFields = Pick<Game, 'isPublic' | 'entityType' | 'parentId'> & {
  parent?: { isPublic?: boolean } | null;
};

/**
 * Public, or a league fixture of a public season — mirrors the backend's
 * `isLiveRailVisible` (minus `showOnLiveRail`, which callers check themselves).
 * Fixtures are always created private so strangers cannot join them from Find;
 * the season's flag is the one that says whether the league is public.
 */
export function isRailVisibleGame(game: RailVisibilityFields): boolean {
  if (game.isPublic) return true;
  return game.entityType === 'LEAGUE' && Boolean(game.parentId) && game.parent?.isPublic === true;
}

export function shouldShowLiveWatchBlock(
  game: Pick<Game, 'resultsStatus' | 'showOnLiveRail'> & RailVisibilityFields,
  viewerIsParticipant: boolean,
): boolean {
  if (viewerIsParticipant) return false;
  if (game.resultsStatus !== 'IN_PROGRESS') return false;
  if (!isRailVisibleGame(game)) return false;
  if (game.showOnLiveRail === false) return false;
  if (game.entityType === 'BAR' || game.entityType === 'LEAGUE_SEASON') return false;
  return true;
}
