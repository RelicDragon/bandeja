/** Keep in sync with Frontend/shared/gameFormat/ */

const KNOWN = new Set([
  'HANDMADE',
  'AUTOMATIC',
  'FIXED',
  'RANDOM',
  'ROUND_ROBIN',
  'ESCALERA',
  'RATING',
  'WINNERS_COURT',
  'KING_OF_COURT',
]);

function parseType(raw: unknown): string | null {
  if (typeof raw !== 'string' || !KNOWN.has(raw)) return null;
  return raw;
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
}): string {
  const v2 = params.resultsRoundGenV2 === true || params.resultsRoundGenV2 === 'true';
  const raw = params.matchGenerationType;
  const rosterCap = params.maxParticipants;
  const ppm = params.playersPerMatch;

  if (v2) {
    if (raw === undefined || raw === null || raw === '') {
      return ppm === 2 ? 'AUTOMATIC' : 'HANDMADE';
    }
    const parsed = parseType(raw);
    if (parsed) return parsed;
    return ppm === 2 ? 'AUTOMATIC' : 'HANDMADE';
  }

  if (rosterCap === 2 || rosterCap === 4) {
    if (raw === undefined || raw === null || raw === '' || raw === 'HANDMADE') {
      return 'AUTOMATIC';
    }
    const parsed = parseType(raw);
    if (parsed) return parsed;
    return 'HANDMADE';
  }

  if (raw === undefined || raw === null || raw === '') {
    return 'HANDMADE';
  }
  const parsed = parseType(raw);
  return parsed ?? 'HANDMADE';
}
