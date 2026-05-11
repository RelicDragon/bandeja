export const MATCH_LIVE_SCORING_V = 1 as const;

export type MatchLiveScoringEnvelopeV1 = {
  v: typeof MATCH_LIVE_SCORING_V;
  revision: number;
  updatedAt: string;
  writerUserId?: string;
  lastClientMessageId?: string;
  recentOpIds?: string[];
  state: Record<string, unknown> | null;
};

export function parseMatchLiveEnvelope(raw: unknown): MatchLiveScoringEnvelopeV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== MATCH_LIVE_SCORING_V || typeof o.revision !== 'number' || typeof o.updatedAt !== 'string') return null;
  return o as MatchLiveScoringEnvelopeV1;
}
