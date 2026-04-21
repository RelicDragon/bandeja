import { MatchGenerationType } from '@prisma/client';

const KNOWN = new Set<string>(Object.values(MatchGenerationType));

function parseType(raw: unknown): MatchGenerationType | null {
  if (typeof raw !== 'string' || !KNOWN.has(raw)) return null;
  return raw as MatchGenerationType;
}

/**
 * Legacy clients: omitted or HANDMADE for 2/4 capacity still meant auto-pairing (stored today as AUTOMATIC).
 * New clients send `resultsRoundGenV2: true` (or string `'true'`) so HANDMADE means empty-shell rounds.
 */
export function resolveMatchGenerationType(params: {
  resultsRoundGenV2: unknown;
  matchGenerationType: unknown;
  maxParticipants: number;
}): MatchGenerationType {
  const v2 = params.resultsRoundGenV2 === true || params.resultsRoundGenV2 === 'true';
  const raw = params.matchGenerationType;
  const maxP = params.maxParticipants;

  if (v2) {
    if (raw === undefined || raw === null || raw === '') {
      return maxP === 2 ? MatchGenerationType.AUTOMATIC : MatchGenerationType.HANDMADE;
    }
    const parsed = parseType(raw);
    if (parsed) return parsed;
    return maxP === 2 ? MatchGenerationType.AUTOMATIC : MatchGenerationType.HANDMADE;
  }

  if (maxP === 2 || maxP === 4) {
    if (raw === undefined || raw === null || raw === '' || raw === 'HANDMADE') {
      return MatchGenerationType.AUTOMATIC;
    }
    const parsed = parseType(raw);
    if (parsed) return parsed;
    return MatchGenerationType.HANDMADE;
  }

  if (raw === undefined || raw === null || raw === '') {
    return MatchGenerationType.HANDMADE;
  }
  const parsed = parseType(raw);
  return parsed ?? MatchGenerationType.HANDMADE;
}
