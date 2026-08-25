import type { PlayIntentInvalidation } from '@bandeja/shared/playIntentRealtime';
import type { EntityType, Sport } from '@prisma/client';
import prisma from '../../config/database';

export {
  PLAY_INTENT_INVALIDATE_EVENT,
  type PlayIntentInvalidation,
  type PlayIntentInvalidationReason,
} from '@bandeja/shared/playIntentRealtime';

export type PublishPlayIntentInvalidation = Omit<
  PlayIntentInvalidation,
  'version' | 'occurredAt'
> & {
  userIds?: string[];
};

export type PlayIntentRealtimeTarget = Pick<
  PublishPlayIntentInvalidation,
  'cityId' | 'sport' | 'entityType'
> & {
  id: string;
  userId: string;
};

type PlayIntentSocketEmitter = {
  emitPlayIntentInvalidation(
    payload: PlayIntentInvalidation,
    userIds: string[],
  ): void;
};

function socketEmitter(): PlayIntentSocketEmitter | undefined {
  return (global as { socketService?: PlayIntentSocketEmitter }).socketService;
}

/**
 * Post-commit realtime invalidation. The HTTP representation remains
 * authoritative; this event only tells connected clients what became stale.
 */
export function publishPlayIntentInvalidation(
  input: PublishPlayIntentInvalidation,
): void {
  const emitter = socketEmitter();
  if (!emitter) return;
  const { userIds = [], ...rest } = input;
  emitter.emitPlayIntentInvalidation(
    {
      version: 1,
      occurredAt: new Date().toISOString(),
      ...rest,
    },
    [...new Set(userIds.filter(Boolean))],
  );
}

/**
 * Publishes already-captured lifecycle metadata after commit. Callers that
 * delete intents (for example user merge) must use this form because the rows
 * are no longer queryable after the transaction.
 */
export function publishCommittedPlayIntentTargetChanges(
  targets: PlayIntentRealtimeTarget[],
): void {
  if (targets.length === 0) return;
  try {
    const groups = new Map<string, PlayIntentRealtimeTarget[]>();
    for (const target of targets) {
      const key = [target.cityId, target.sport, target.entityType].join(':');
      const group = groups.get(key);
      if (group) {
        group.push(target);
      } else {
        groups.set(key, [target]);
      }
    }

    for (const group of groups.values()) {
      const [first] = group;
      if (!first) continue;
      publishPlayIntentInvalidation({
        reason: 'intent-status-changed',
        ...(group.length === 1 ? { intentId: first.id } : {}),
        cityId: first.cityId,
        sport: first.sport,
        entityType: first.entityType,
        userIds: group.map((intent) => intent.userId),
      });
    }
  } catch (error) {
    console.error('[PlayIntentRealtime] Failed to publish committed lifecycle targets', {
      intentIds: targets.map((target) => target.id),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function publishMatchingGamesChanged(game: {
  cityId: string;
  sport: Sport;
  entityType: EntityType;
  isPublic?: boolean;
}): void {
  if (game.isPublic === false) return;
  if (
    game.entityType !== 'GAME' &&
    game.entityType !== 'TOURNAMENT' &&
    game.entityType !== 'BAR'
  ) {
    return;
  }
  publishPlayIntentInvalidation({
    reason: 'matching-games-changed',
    cityId: game.cityId,
    sport: game.sport,
    entityType: game.entityType,
  });
}

export async function publishMatchingGamesChangedForGameId(
  gameId: string,
): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      cityId: true,
      sport: true,
      entityType: true,
      isPublic: true,
    },
  });
  if (game) publishMatchingGamesChanged(game);
}

/**
 * Resolves lifecycle metadata only after the surrounding transaction commits,
 * then emits one invalidation per affected city/sport/entity group. Realtime
 * is best-effort: a lookup failure must not turn an already-committed API
 * operation into an apparent failure. Reconnect/focus and the slow
 * reconciliation poll remain the recovery path.
 */
export async function publishCommittedPlayIntentStatusChanges(
  intentIds: Array<string | null | undefined>,
): Promise<void> {
  const uniqueIds = [...new Set(intentIds.filter((id): id is string => !!id))];
  if (uniqueIds.length === 0) return;

  try {
    const intents = await prisma.playIntent.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        userId: true,
        cityId: true,
        sport: true,
        entityType: true,
      },
    });
    publishCommittedPlayIntentTargetChanges(intents);
  } catch (error) {
    console.error('[PlayIntentRealtime] Failed to publish committed lifecycle changes', {
      intentIds: uniqueIds,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
