/**
 * PRD 354 — upcoming games at a club, for the public club page.
 *
 * This module deliberately writes **no new game query**. It calls the same
 * `fetchAvailableGamesPage` the Find tab uses, with the club pinned as a
 * structural filter, and the same `projectAvailableGameCardPayload` card
 * projection — so a card here can never carry a field a Find card would not.
 *
 * Two things differ from `/games/available/upcoming`:
 *
 *  1. **Guests.** `GameReadService.getAvailableUpcomingGames` throws 401 on a
 *     missing user id. The club page is a landing page, so a guest passes an
 *     empty viewer id: `buildVisibilityOr('')` then matches public games only —
 *     the private branch (`participants: { some: { userId: '' } }`) matches
 *     nothing, which is exactly the desired behaviour.
 *  2. **City.** Find scopes to the *viewer's* city. A club page must show that
 *     club's games even when the viewer is browsing from another city, so the
 *     club's own `cityId` is passed as `userCityId`.
 */
import type { Sport } from '@prisma/client';
import { fetchAvailableGamesPage } from '../game/availableGamesQuery';
import { projectAvailableGameCardPayload, projectGameUsersForSportContext } from '../game/read.service';

export const CLUB_PUBLIC_GAMES_LIMIT = 10;

export type ClubPublicGamesViewer = {
  userId: string | null;
  cityId?: string | null;
  primarySport?: Sport | null;
  isAdmin?: boolean;
};

export type ClubPublicGamesResult = {
  games: unknown[];
  hasMore: boolean;
};

export async function getClubPublicGames(
  club: { id: string; cityId: string },
  viewer: ClubPublicGamesViewer,
  take: number = CLUB_PUBLIC_GAMES_LIMIT,
): Promise<ClubPublicGamesResult> {
  const viewerId = viewer.userId ?? '';
  // `buildPhotoViewer` semantics: no viewer => no private game photos.
  const photoViewer = viewerId ? { id: viewerId, isAdmin: viewer.isAdmin ?? false } : undefined;

  const { games, meta } = await fetchAvailableGamesPage(
    {
      userId: viewerId,
      // Club's city, not the viewer's — see the module note.
      userCityId: club.cityId,
      // `undefined` would trigger a `User` lookup we cannot make for a guest.
      primarySport: viewer.primarySport ?? null,
      includeLeagues: false,
      showPrivateGames: false,
      isAdmin: false,
      structural: { clubIds: [club.id], requireTimeSet: false },
      take,
      kind: 'upcoming',
      order: 'asc',
      enrich: Boolean(viewerId),
    },
    (game) =>
      projectAvailableGameCardPayload(
        projectGameUsersForSportContext(game as Record<string, unknown> & { sport?: Sport }),
        photoViewer,
      ),
  );

  return { games, hasMore: meta.hasMore };
}
