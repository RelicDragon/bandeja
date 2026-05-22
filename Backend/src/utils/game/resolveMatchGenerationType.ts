import { MatchGenerationType } from '@prisma/client';

const KNOWN = new Set<string>(Object.values(MatchGenerationType));

function parseType(raw: unknown): MatchGenerationType | null {
  if (typeof raw !== 'string' || !KNOWN.has(raw)) return null;
  return raw as MatchGenerationType;
}

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
  const v2 = params.resultsRoundGenV2 === true || params.resultsRoundGenV2 === 'true';
  const raw = params.matchGenerationType;
  const rosterCap = params.maxParticipants;
  const ppm = params.playersPerMatch;

  if (v2) {
    if (raw === undefined || raw === null || raw === '') {
      return ppm === 2 ? MatchGenerationType.AUTOMATIC : MatchGenerationType.HANDMADE;
    }
    const parsed = parseType(raw);
    if (parsed) return parsed;
    return ppm === 2 ? MatchGenerationType.AUTOMATIC : MatchGenerationType.HANDMADE;
  }

  if (rosterCap === 2 || rosterCap === 4) {
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
