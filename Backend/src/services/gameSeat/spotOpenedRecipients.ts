import { SpotOpenedKind } from '@prisma/client';

/**
 * PRD 347 — who hears about a freed PLAYING seat, in priority order.
 *
 * Pure on purpose: the audience rules are the part of this feature that is
 * easy to get subtly wrong (owner leakage, private games, a user sitting in
 * two buckets at once), so they are testable without a database.
 */
export interface SpotOpenedAudience {
  /** Users sitting in the join queue, `joinedAt` ascending. */
  queueUserIds: string[];
  /** Users whose OPEN play intent matches this game (matcher output). */
  intentUserIds: string[];
  /** Followers of the PLAYING participants who opted in. */
  followerUserIds: string[];
  /** The game owner — never notified about their own game. */
  ownerUserId: string | null;
  /** Private games notify queue members only. */
  isPublic: boolean;
  /** Anyone already holding a seat, so a PLAYING player is never invited back. */
  seatedUserIds?: string[];
}

export interface SpotOpenedRecipient {
  userId: string;
  kind: SpotOpenedKind;
}

/**
 * Highest-priority bucket wins: a queued player who also has a matching intent
 * gets the queue copy ("You're #1 in the queue"), never two notifications.
 */
export function buildSpotOpenedRecipients(
  audience: SpotOpenedAudience,
): SpotOpenedRecipient[] {
  const excluded = new Set<string>(audience.seatedUserIds ?? []);
  if (audience.ownerUserId) excluded.add(audience.ownerUserId);

  const recipients: SpotOpenedRecipient[] = [];
  const seen = new Set<string>();

  const push = (userIds: string[], kind: SpotOpenedKind) => {
    for (const userId of userIds) {
      if (!userId) continue;
      if (excluded.has(userId)) continue;
      if (seen.has(userId)) continue;
      seen.add(userId);
      recipients.push({ userId, kind });
    }
  };

  // Queue members are never excluded by privacy: they asked to be here.
  push(audience.queueUserIds, SpotOpenedKind.QUEUE);
  if (!audience.isPublic) return recipients;

  push(audience.intentUserIds, SpotOpenedKind.INTENT);
  push(audience.followerUserIds, SpotOpenedKind.FOLLOWER);
  return recipients;
}

/** 1-based position of `userId` in the queue, or `null` when not queued. */
export function queuePosition(queueUserIds: string[], userId: string): number | null {
  const index = queueUserIds.indexOf(userId);
  return index === -1 ? null : index + 1;
}
