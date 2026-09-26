/**
 * PRD 349 — "X is playing live" push to followers.
 *
 * Fired **once per game**, at the moment `resultsStatus` becomes
 * `IN_PROGRESS`, and only for a game that is actually watchable
 * (`isLiveRailVisible`: public or a public season's fixture, + `showOnLiveRail`). Dedupe is a real table, `LiveGameNotifyDelivery`, keyed
 * `(userId, gameId)` — CONTRACT §5.4 explicitly forbids copying the in-memory
 * `Set` the legacy reminder path uses, because that is lost on restart and this
 * push must never double-fire.
 *
 * Audience: everyone who follows a PLAYING participant, restricted exactly like
 * the play-intent follower fan-out (`playIntentFollowerAudience.ts`) — same
 * city, sport enabled, neither side blocked — minus the players themselves.
 */
import { Prisma, Sport } from '@prisma/client';
import prisma from '../../config/database';
import notificationService from '../notification.service';
import { NotificationType } from '../../types/notifications.types';
import { getSportConfig } from '../../sport/sportRegistry';
import { t } from '../../utils/translations';
import { liveT } from './liveCopy';
import { isLiveRailVisible } from '../game/availableGamesStructuralWhere';

const PRISMA_UNIQUE_VIOLATION = 'P2002';

/** Watchable now: the same conditions the rail and `/live` apply. */
const liveNotifiableGameSelect = {
  id: true,
  name: true,
  sport: true,
  isPublic: true,
  showOnLiveRail: true,
  entityType: true,
  parentId: true,
  parent: { select: { isPublic: true } },
  resultsStatus: true,
  cityId: true,
  city: { select: { name: true } },
  club: { select: { name: true } },
  court: { select: { club: { select: { name: true } } } },
  participants: {
    where: { status: 'PLAYING' as const },
    select: {
      userId: true,
      user: { select: { id: true, firstName: true } },
    },
  },
} as const;

function followerWhere(
  playerIds: string[],
  cityId: string,
  sport: Sport,
): Prisma.UserFavoriteUserWhereInput {
  return {
    favoriteUserId: { in: playerIds },
    userId: { notIn: playerIds },
    user: {
      currentCityId: cityId,
      OR:
        sport === Sport.PADEL
          ? [{ sportsEnabled: { has: sport } }, { sportsEnabled: { isEmpty: true } }]
          : [{ sportsEnabled: { has: sport } }],
      blockedUsers: { none: { blockedUserId: { in: playerIds } } },
      blockedBy: { none: { userId: { in: playerIds } } },
    },
  };
}

/** Claim the (userId, gameId) slot. `false` when this user was already told. */
async function claimDelivery(userId: string, gameId: string): Promise<boolean> {
  try {
    await prisma.liveGameNotifyDelivery.create({ data: { userId, gameId } });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_VIOLATION
    ) {
      return false;
    }
    throw error;
  }
}

export type NotifyFollowersGameWentLiveResult = {
  /** Notifications actually dispatched (already-delivered followers excluded). */
  sent: number;
  /** Why nothing was sent, when `sent` is 0. */
  skipped?: 'not-live' | 'not-public' | 'rail-hidden' | 'no-players' | 'no-followers';
};

/**
 * Notify followers that `gameId` just went live. Safe to call more than once
 * and from more than one transition site — the delivery table makes it
 * idempotent per recipient.
 */
export async function notifyFollowersGameWentLive(
  gameId: string,
): Promise<NotifyFollowersGameWentLiveResult> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: liveNotifiableGameSelect,
  });
  if (!game) return { sent: 0, skipped: 'not-live' };
  if (game.resultsStatus !== 'IN_PROGRESS') return { sent: 0, skipped: 'not-live' };
  if (!game.showOnLiveRail) return { sent: 0, skipped: 'rail-hidden' };
  if (!isLiveRailVisible(game)) return { sent: 0, skipped: 'not-public' };

  const playerIds = game.participants.map((p) => p.userId);
  if (playerIds.length === 0) return { sent: 0, skipped: 'no-players' };

  const follows = await prisma.userFavoriteUser.findMany({
    where: followerWhere(playerIds, game.cityId, game.sport),
    select: { userId: true, favoriteUserId: true },
  });
  if (follows.length === 0) return { sent: 0, skipped: 'no-followers' };

  // One notification per follower, naming the first followed player on court.
  const firstFollowed = new Map<string, string>();
  for (const row of follows) {
    if (!firstFollowed.has(row.userId)) firstFollowed.set(row.userId, row.favoriteUserId);
  }

  const nameById = new Map(game.participants.map((p) => [p.userId, p.user.firstName]));
  const clubName = game.club?.name ?? game.court?.club?.name ?? null;
  const recipients = await prisma.user.findMany({
    where: { id: { in: [...firstFollowed.keys()] } },
    select: { id: true, language: true },
  });

  let sent = 0;
  for (const recipient of recipients) {
    const claimed = await claimDelivery(recipient.id, game.id);
    if (!claimed) continue;

    const lang = recipient.language || 'en';
    const playerName = nameById.get(firstFollowed.get(recipient.id) ?? '') ?? null;
    const sportLabel = t(getSportConfig(game.sport).labelKey, lang);

    const title = playerName
      ? liveT('live.followerTitle', lang, { name: playerName })
      : liveT('live.followerFallbackTitle', lang);
    const body = clubName
      ? liveT('live.followerBodyAtClub', lang, { sport: sportLabel, club: clubName })
      : liveT('live.followerBody', lang, { sport: sportLabel, city: game.city.name });

    try {
      await notificationService.sendNotification({
        userId: recipient.id,
        type: NotificationType.FOLLOWED_USER_LIVE,
        payload: {
          type: NotificationType.FOLLOWED_USER_LIVE,
          title,
          body,
          /*
           * No `actions` array: push action buttons are identifiers dispatched
           * by `pushInviteAction.controller.ts`, and "Watch" is pure
           * navigation. `data.gameId` is what the app opens on tap, which is
           * exactly the Watch affordance the PRD asks for.
           */
          data: { gameId: game.id },
        },
      });
      sent += 1;
    } catch (error) {
      console.error('[live] follower live notification failed', game.id, recipient.id, error);
    }
  }

  return sent > 0 ? { sent } : { sent: 0, skipped: 'no-followers' };
}

/**
 * Fire-and-forget wrapper for the `IN_PROGRESS` transition sites. Never throws
 * and never delays the request that triggered it — a missed follower push must
 * not fail a live-scoring write.
 */
export function notifyFollowersGameWentLiveInBackground(gameId: string): void {
  void notifyFollowersGameWentLive(gameId).catch((error) => {
    console.error('[live] follower live fan-out failed', gameId, error);
  });
}
