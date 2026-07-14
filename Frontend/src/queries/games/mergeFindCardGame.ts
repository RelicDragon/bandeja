import type { Game } from '@/types';

const STRIP_ROOT_KEYS = [
  'resultsArtifacts',
  'linkedBookings',
  'resultsArtifactJob',
  'rounds',
  'outcomes',
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
