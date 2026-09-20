/**
 * PRD 354 — "Regulars" row on the public club page.
 *
 * The eight players who appeared most often as `PLAYING` participants of a game
 * at this club in the last 90 days.
 *
 * Privacy rules, all load-bearing:
 *  - Only **public profiles** are counted. A deactivated account, or an account
 *    that never finished naming itself, is invisible here.
 *  - Blocks are honoured in **both** directions: the viewer never sees somebody
 *    they blocked, and never sees somebody who blocked them.
 *  - The club-level aggregate is cached for 10 minutes. The cache holds the
 *    *public* candidate list only; the per-viewer block filter runs after the
 *    cache, so one viewer's block list can never leak into another's page.
 *  - Private games count towards the tally — the *player* is public, the game is
 *    never named. The response carries no game ids and no play counts, so it
 *    cannot be used to infer a private schedule.
 */
import prisma from '../../config/database';
import { TtlCache } from '../../utils/ttlCache';
import {
  applyRegularsBlockFilter,
  clubRegularsWindowStart,
  CLUB_REGULARS_LIMIT,
  type ClubRegular,
} from './clubPublicRegulars.privacy';

export {
  applyRegularsBlockFilter,
  clubRegularsWindowStart,
  CLUB_REGULARS_LIMIT,
  CLUB_REGULARS_WINDOW_DAYS,
} from './clubPublicRegulars.privacy';
export type { ClubRegular } from './clubPublicRegulars.privacy';

/** Whitelist. Never spread `USER_SELECT_FIELDS` here — it carries bio/availability. */
const REGULAR_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  isPremium: true,
  showPremiumStatus: true,
  isTrainer: true,
  primarySport: true,
} as const;

const CLUB_REGULARS_TTL_MS = 10 * 60 * 1000;
/** Over-fetch so a viewer with blocks still gets a full row after filtering. */
const CLUB_REGULARS_CANDIDATE_LIMIT = CLUB_REGULARS_LIMIT * 3;

const regularsCache = new TtlCache<string, ClubRegular[]>(CLUB_REGULARS_TTL_MS);

/** Test seam — the cache is process-local and otherwise invisible. */
export function clearClubRegularsCache(): void {
  regularsCache.clear();
}

async function loadPublicRegularCandidates(clubId: string): Promise<ClubRegular[]> {
  const since = clubRegularsWindowStart();

  const grouped = await prisma.gameParticipant.groupBy({
    by: ['userId'],
    where: {
      status: 'PLAYING',
      game: {
        clubId,
        startTime: { gte: since, lte: new Date() },
        status: { not: 'ARCHIVED' },
      },
    },
    _count: { userId: true },
    orderBy: { _count: { userId: 'desc' } },
    take: CLUB_REGULARS_CANDIDATE_LIMIT,
  });

  const orderedIds = grouped.map((row) => row.userId);
  if (orderedIds.length === 0) return [];

  const users = await prisma.user.findMany({
    // A "public profile" is an active account that has a name to show. There is
    // no profile-visibility column on `User`; if one is ever added, it belongs
    // in this `where` and nowhere else.
    where: { id: { in: orderedIds }, isActive: true, nameIsSet: true },
    select: REGULAR_USER_SELECT,
  });

  const byId = new Map(users.map((u) => [u.id, u]));
  return orderedIds
    .map((id) => byId.get(id))
    .filter((u): u is (typeof users)[number] => u != null)
    .map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      avatar: u.avatar,
      isPremium: u.isPremium,
      showPremiumStatus: u.showPremiumStatus,
      isTrainer: u.isTrainer,
      primarySport: u.primarySport,
    }));
}

async function loadBlockedIds(viewerId: string): Promise<Set<string>> {
  const edges = await prisma.blockedUser.findMany({
    where: { OR: [{ userId: viewerId }, { blockedUserId: viewerId }] },
    select: { userId: true, blockedUserId: true },
  });
  const ids = new Set<string>();
  for (const edge of edges) {
    ids.add(edge.userId === viewerId ? edge.blockedUserId : edge.userId);
  }
  return ids;
}

export async function getClubRegulars(
  clubId: string,
  viewerId: string | null,
): Promise<ClubRegular[]> {
  const candidates = await regularsCache.getOrSet(clubId, () =>
    loadPublicRegularCandidates(clubId),
  );
  if (candidates.length === 0) return [];

  const blockedIds = viewerId ? await loadBlockedIds(viewerId) : new Set<string>();
  return applyRegularsBlockFilter(candidates, blockedIds);
}
