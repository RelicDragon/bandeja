export const GAME_TEXT_INVALIDATE_EVENT = 'game-text:invalidate' as const;

export type GameTextInvalidationReason = 'published' | 'corrected';

/**
 * Socket invalidation only — no translated name/description.
 * Clients refetch via permission-checked HTTP.
 */
export type GameTextInvalidation = {
  version: 1;
  gameId: string;
  locale: string;
  nameSourceRevision: number;
  descriptionSourceRevision: number;
  reason: GameTextInvalidationReason;
  occurredAt: string;
};
