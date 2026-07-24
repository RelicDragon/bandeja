import type { Game } from '@/types';

const STRIP_ROOT_KEYS = [
  'resultsArtifacts',
  'linkedBookings',
  'resultsArtifactJob',
  'rounds',
  'fixedTeams',
  'externalBookings',
] as const;

const STRIP_USER_KEYS = [
  'bio',
  'verbalStatus',
  'weeklyAvailability',
  'availabilityBucketBoundaries',
  'socialLevel',
  'sportProfiles',
  'phone',
  'email',
] as const;

function omitKeys<T extends Record<string, unknown>>(obj: T, keys: readonly string[]): T {
  const next = { ...obj };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

function slimFindCardUser(user: unknown): unknown {
  if (!user || typeof user !== 'object') return user;
  return omitKeys(user as Record<string, unknown>, STRIP_USER_KEYS);
}

function slimClub(club: unknown): unknown {
  if (!club || typeof club !== 'object') return club;
  return omitKeys(club as Record<string, unknown>, ['integrationConfig', 'integrationType']);
}

function slimCity(city: unknown): unknown {
  if (!city || typeof city !== 'object') return city;
  return omitKeys(city as Record<string, unknown>, ['telegramGroupId']);
}

function slimCourt(court: unknown): unknown {
  if (!court || typeof court !== 'object') return court;
  const base = { ...(court as Record<string, unknown>) };
  if ('club' in base) {
    base.club = slimClub(base.club);
  }
  return base;
}

/** Keep only fields GameCard standings need — avoid re-inflating outcome.user trees. */
function slimFindCardOutcomes(outcomes: unknown): unknown {
  if (!Array.isArray(outcomes)) return [];
  const slimmed: Array<{ userId: string; position: number }> = [];
  for (const row of outcomes) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    if (typeof o.userId !== 'string' || o.userId.length === 0) continue;
    if (typeof o.position !== 'number' || !Number.isFinite(o.position)) continue;
    slimmed.push({ userId: o.userId, position: o.position });
  }
  return slimmed;
}

function preserveExistingFindOutcomes(existingRecord: Record<string, unknown>): unknown {
  const positioned = slimFindCardOutcomes(existingRecord.outcomes);
  return Array.isArray(positioned) && positioned.length > 0 ? positioned : undefined;
}

function resolveFindCardOutcomes(
  incomingRecord: Record<string, unknown>,
  existingRecord: Record<string, unknown>,
): unknown {
  const resultsStatus =
    (incomingRecord.resultsStatus as string | undefined) ??
    (existingRecord.resultsStatus as string | undefined);
  if (resultsStatus !== 'FINAL') {
    return undefined;
  }

  const incomingOutcomes = incomingRecord.outcomes;
  // Omit / null / [] — incomplete socket patches must not wipe standings.
  if (
    !('outcomes' in incomingRecord) ||
    incomingOutcomes === undefined ||
    incomingOutcomes === null ||
    (Array.isArray(incomingOutcomes) && incomingOutcomes.length === 0)
  ) {
    return preserveExistingFindOutcomes(existingRecord);
  }

  const positioned = slimFindCardOutcomes(incomingOutcomes);
  if (Array.isArray(positioned) && positioned.length > 0) {
    return positioned;
  }

  // Non-empty incoming with no positions (e.g. training rating-only) → clear.
  return undefined;
}

/**
 * Merge a live socket/detail game onto a Find card row without re-inflating
 * fat detail trees (keeps Find cache small after patches).
 */
export function mergeFindCardGame(existing: Game, incoming: Game): Game {
  const incomingRecord = omitKeys(
    { ...(incoming as unknown as Record<string, unknown>) },
    STRIP_ROOT_KEYS,
  );

  if (incomingRecord.city !== undefined) {
    incomingRecord.city = slimCity(incomingRecord.city);
  }
  if (incomingRecord.club !== undefined) {
    incomingRecord.club = slimClub(incomingRecord.club);
  }
  if (incomingRecord.court !== undefined) {
    incomingRecord.court = slimCourt(incomingRecord.court);
  }

  const existingRecord = existing as unknown as Record<string, unknown>;
  const participants = Array.isArray(incomingRecord.participants)
    ? (incomingRecord.participants as Array<Record<string, unknown>>).map((p) => ({
        ...p,
        user: slimFindCardUser(p.user),
      }))
    : existing.participants;

  return {
    ...existing,
    ...incomingRecord,
    participants,
    outcomes: resolveFindCardOutcomes(incomingRecord, existingRecord),
    userNote:
      incomingRecord.userNote !== undefined ? incomingRecord.userNote : existingRecord.userNote,
    weatherSummary:
      incomingRecord.weatherSummary !== undefined
        ? incomingRecord.weatherSummary
        : existingRecord.weatherSummary,
    reactions:
      incomingRecord.reactions !== undefined
        ? incomingRecord.reactions
        : existingRecord.reactions,
  } as Game;
}
