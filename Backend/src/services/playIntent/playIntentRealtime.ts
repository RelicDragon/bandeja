import type { EntityType, Sport } from '@prisma/client';

export const PLAY_INTENT_INVALIDATE_EVENT = 'play-intent:invalidate' as const;

export type PlayIntentInvalidationReason =
  | 'intent-created'
  | 'intent-cancelled'
  | 'intent-expired'
  | 'intent-status-changed'
  | 'proposal-created'
  | 'proposal-updated'
  | 'proposal-expired'
  | 'proposal-converted';

export type PlayIntentInvalidation = {
  version: 1;
  reason: PlayIntentInvalidationReason;
  cityId: string;
  sport: Sport;
  entityType: EntityType;
  occurredAt: string;
  intentId?: string;
  proposalId?: string;
};

export type PublishPlayIntentInvalidation = Omit<
  PlayIntentInvalidation,
  'version' | 'occurredAt'
> & {
  userIds?: string[];
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
