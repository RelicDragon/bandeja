/**
 * PRD 352 — visibility filter for any pair surface that **names** a game.
 *
 * Pure (type-only Prisma import) so the rule can be asserted without a
 * database, like the rest of the pair rules.
 *
 * The pair aggregates (games / wins / chemistry) deliberately count private
 * games — the same trade-off `clubPublicRegulars.service.ts` makes: a count
 * reveals nothing, a name, a venue and a kick-off time reveal a lot.
 * `GET /rankings/pairs/:pairId` takes both user ids straight from the path and
 * has no membership check, so without this filter any authenticated account
 * could list the last five games of any two people it can see on a Find card
 * or a leaderboard — private games included.
 *
 * Product decision recorded here so it is not re-litigated: an arbitrary viewer
 * **may** inspect an arbitrary pair's totals (they are already public on the
 * city pair leaderboard, and `getPairDetail` 404s for a pair with no stored
 * `PairStat` row, so the surface is not enumerable beyond it) but **may not**
 * see a private game named.
 */
import type { Prisma } from '@prisma/client';

export function pairVisibleGameWhere(viewerUserId: string): Prisma.GameWhereInput {
  if (!viewerUserId) return { isPublic: true };
  return {
    OR: [
      { isPublic: true },
      { isPublic: false, participants: { some: { userId: viewerUserId } } },
    ],
  };
}
