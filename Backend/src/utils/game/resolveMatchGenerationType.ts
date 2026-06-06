import { MatchGenerationType } from '@prisma/client';
import { resolveMatchGenerationType as resolveMatchGenerationTypeCore } from '../../shared/gameFormat/resolveMatchGenerationType';

/**
 * Legacy clients: omitted or HANDMADE for small event roster (2/4) still meant auto-pairing.
 * Match format (1v1 vs 2v2) uses `playersPerMatch`; event capacity uses `maxParticipants`.
 * New clients send `resultsRoundGenV2: true` so HANDMADE means empty-shell rounds.
 */
export function resolveMatchGenerationType(params: {
  resultsRoundGenV2: unknown;
  matchGenerationType: unknown;
  maxParticipants: number;
  playersPerMatch: number;
}): MatchGenerationType {
  return resolveMatchGenerationTypeCore(params) as MatchGenerationType;
}
