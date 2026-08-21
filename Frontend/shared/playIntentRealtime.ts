import type { Sport } from './sport';

export const PLAY_INTENT_INVALIDATE_EVENT = 'play-intent:invalidate' as const;

export type PlayIntentEntityType =
  | 'GAME'
  | 'TOURNAMENT'
  | 'TRAINING'
  | 'BAR'
  | 'LEAGUE'
  | 'LEAGUE_SEASON';

export type PlayIntentInvalidationReason =
  | 'intent-created'
  | 'intent-cancelled'
  | 'intent-expired'
  | 'intent-status-changed'
  | 'proposal-created'
  | 'proposal-updated'
  | 'proposal-expired'
  | 'proposal-converted'
  | 'matching-games-changed';

export type PlayIntentInvalidation = {
  version: 1;
  reason: PlayIntentInvalidationReason;
  cityId: string;
  sport: Sport;
  entityType: PlayIntentEntityType;
  occurredAt: string;
  intentId?: string;
  proposalId?: string;
};
