export const MATCH_LIVE_SCORING_V = 1 as const;

export type MatchLiveScoringEnvelopeV1 = {
  v: typeof MATCH_LIVE_SCORING_V;
  revision: number;
  updatedAt: string;
  writerUserId?: string;
  lastClientMessageId?: string;
  /** Last N logical op ids for idempotent retries (Phase 6). */
  recentOpIds?: string[];
  state: Record<string, unknown> | null;
};

export function isLiveScoringEnvelopeV1(x: unknown): x is MatchLiveScoringEnvelopeV1 {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return o.v === MATCH_LIVE_SCORING_V && typeof o.revision === 'number' && typeof o.updatedAt === 'string';
}
