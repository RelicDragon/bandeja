import { NotificationChannelType, type Sport } from '@prisma/client';
import prisma from '../../config/database';
import { followerAudienceWhere } from '../playIntent/playIntentFollowerAudience';

/**
 * PRD 347 — followers of the players still holding a seat.
 *
 * Opt-in: the authoritative per-channel check happens in
 * `NotificationService.sendNotification` via
 * `sendPlayIntentSocialNotifications`, but we pre-filter in bulk so a user who
 * turned the preference off never burns a `SpotOpenedDelivery` row (which would
 * silently suppress the notification they *do* want tomorrow).
 */
export interface FollowerScopeGame {
  cityId: string;
  sport: Sport;
}

export interface FollowerRecipient {
  /** The follower who gets the notification. */
  userId: string;
  /** The seated player they follow, for "Marko's game has a free spot". */
  followedUserId: string;
  followedUserName: string | null;
}

export async function listFollowerRecipientsForGame(
  game: FollowerScopeGame,
  seatedUserIds: string[],
): Promise<FollowerRecipient[]> {
  if (seatedUserIds.length === 0) return [];

  const seated = new Set(seatedUserIds);
  const batches = await Promise.all(
    seatedUserIds.map((playerId) =>
      prisma.userFavoriteUser.findMany({
        where: followerAudienceWhere(playerId, game.cityId, game.sport),
        select: {
          userId: true,
          favoriteUserId: true,
          favoriteUser: { select: { firstName: true, lastName: true } },
        },
      }),
    ),
  );

  // First follow wins, so one follower is told about one player, not four.
  const byFollower = new Map<string, FollowerRecipient>();
  for (const batch of batches) {
    for (const row of batch) {
      if (seated.has(row.userId)) continue;
      if (byFollower.has(row.userId)) continue;
      const name = `${row.favoriteUser?.firstName ?? ''} ${row.favoriteUser?.lastName ?? ''}`.trim();
      byFollower.set(row.userId, {
        userId: row.userId,
        followedUserId: row.favoriteUserId,
        followedUserName: name || null,
      });
    }
  }
  if (byFollower.size === 0) return [];

  const optedOut = await listUsersWithSocialNotificationsOff([...byFollower.keys()]);
  return [...byFollower.values()].filter((entry) => !optedOut.has(entry.userId));
}

/**
 * Returns the users who have preference rows and turned
 * `sendPlayIntentSocialNotifications` off on **every** channel they own.
 * A user with no rows at all keeps the default (on).
 */
export async function listUsersWithSocialNotificationsOff(
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.notificationPreference.findMany({
    where: {
      userId: { in: userIds },
      channelType: {
        in: [NotificationChannelType.PUSH, NotificationChannelType.TELEGRAM],
      },
    },
    select: { userId: true, sendPlayIntentSocialNotifications: true },
  });

  const allowedSomewhere = new Set<string>();
  const hasRow = new Set<string>();
  for (const row of rows) {
    hasRow.add(row.userId);
    if (row.sendPlayIntentSocialNotifications) allowedSomewhere.add(row.userId);
  }
  return new Set([...hasRow].filter((userId) => !allowedSomewhere.has(userId)));
}
