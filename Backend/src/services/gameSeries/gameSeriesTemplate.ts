import type { EntityType } from '@prisma/client';
import {
  isDayKey,
  isLocalTimeString,
  type DayKey,
  type GameSeriesCadenceValue,
} from './gameSeriesOccurrenceDates';

/**
 * PRD 345 — the replayed create-game payload stored in `GameSeries.template`.
 *
 * Wave 1 left the column as free-form `Json` by design, so this module owns the
 * shape. Two rules make it safe:
 *
 * 1. **Allow-list, never spread.** Only the keys below survive a round trip, so
 *    a future create-game field can never leak into a series template and start
 *    silently replaying stale data.
 * 2. **No schedule inside the template.** `startTime` / `endTime` are derived
 *    per occurrence from the series columns (`weekday`, `startTimeLocal`,
 *    `durationMinutes`, `cadence`), so a template can never pin a generated
 *    game to the original date. `cityId` *is* stored — it is location, not
 *    schedule, and a clubless series would otherwise have nowhere to read it
 *    from once its first occurrence is gone.
 */

/** Scalars copied verbatim into every occurrence's create payload. */
export interface GameSeriesTemplate {
  /** Club-local `YYYY-MM-DD` of the occurrence that seeded the series. Sets the cadence phase. */
  anchorDayKey: DayKey;
  /** City the occurrences belong to. Copied from the seeding game, never re-derived. */
  cityId?: string | null;
  sport: string;
  entityType: EntityType;
  gameType?: string | null;
  name?: string | null;
  description?: string | null;
  maxParticipants: number;
  minParticipants?: number | null;
  playersPerMatch?: number | null;
  minLevel?: number | null;
  maxLevel?: number | null;
  isPublic: boolean;
  affectsRating?: boolean | null;
  anyoneCanInvite?: boolean | null;
  resultsByAnyone?: boolean | null;
  allowDirectJoin?: boolean | null;
  afterGameGoToBar?: boolean | null;
  /** PRD 360 — every occurrence inherits the series' "Novices welcome" promise. */
  suitableForNovices?: boolean | null;
  hasFixedTeams?: boolean | null;
  allowUserInMultipleTeams?: boolean | null;
  genderTeams?: string | null;
  fixedNumberOfSets?: number | null;
  maxTotalPointsPerSet?: number | null;
  matchTimedCapMinutes?: number | null;
  matchTimerEnabled?: boolean | null;
  maxPointsPerTeam?: number | null;
  winnerOfGame?: string | null;
  winnerOfMatch?: string | null;
  matchGenerationType?: string | null;
  pointsPerWin?: number | null;
  pointsPerLoose?: number | null;
  pointsPerTie?: number | null;
  ballsInGames?: boolean | null;
  scoringPreset?: string | null;
  scoringMode?: string | null;
  deucesBeforeGoldenPoint?: number | null;
  priceType?: string | null;
  priceTotal?: number | null;
  priceCurrency?: string | null;
}

/** Keys the template is allowed to carry, besides `anchorDayKey`. */
const NUMBER_KEYS = [
  'maxParticipants',
  'minParticipants',
  'playersPerMatch',
  'minLevel',
  'maxLevel',
  'fixedNumberOfSets',
  'maxTotalPointsPerSet',
  'matchTimedCapMinutes',
  'maxPointsPerTeam',
  'pointsPerWin',
  'pointsPerLoose',
  'pointsPerTie',
  'deucesBeforeGoldenPoint',
  'priceTotal',
] as const;

const BOOLEAN_KEYS = [
  'isPublic',
  'affectsRating',
  'anyoneCanInvite',
  'resultsByAnyone',
  'allowDirectJoin',
  'afterGameGoToBar',
  'suitableForNovices',
  'hasFixedTeams',
  'allowUserInMultipleTeams',
  'matchTimerEnabled',
  'ballsInGames',
] as const;

const STRING_KEYS = [
  'cityId',
  'sport',
  'entityType',
  'gameType',
  'name',
  'description',
  'genderTeams',
  'winnerOfGame',
  'winnerOfMatch',
  'matchGenerationType',
  'scoringPreset',
  'scoringMode',
  'priceType',
  'priceCurrency',
] as const;

/**
 * Keys `GameCreateService` reads to link — or claim — a real court booking.
 * None of them is allow-listed above, so they never reach a stored template;
 * `buildOccurrenceCreatePayload` strips them again on the way out so a
 * hand-built template cannot make the scheduler book anything either.
 */
const BOOKING_KEYS = [
  'hasBookedCourt',
  'externalBookingId',
  'externalBookingIds',
  'externalBookingProvider',
  'bookingSnapshots',
] as const;

type TemplateSourceRecord = Record<string, unknown>;

function readNumber(source: TemplateSourceRecord, key: string): number | null | undefined {
  const raw = source[key];
  if (raw === null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return undefined;
}

function readBoolean(source: TemplateSourceRecord, key: string): boolean | undefined {
  const raw = source[key];
  return typeof raw === 'boolean' ? raw : undefined;
}

function readString(source: TemplateSourceRecord, key: string): string | null | undefined {
  const raw = source[key];
  if (raw === null) return null;
  if (typeof raw === 'string') return raw;
  return undefined;
}

/**
 * Project an arbitrary game row / create payload onto the template allow-list.
 * Unknown keys are dropped; `undefined` values are omitted entirely so the
 * stored JSON stays small and `Prisma.JsonValue`-clean.
 */
export function buildGameSeriesTemplate(
  source: TemplateSourceRecord,
  anchorDayKey: DayKey,
): GameSeriesTemplate {
  if (!isDayKey(anchorDayKey)) {
    throw new RangeError(`Invalid anchor day key: ${anchorDayKey}`);
  }

  const out: TemplateSourceRecord = { anchorDayKey };

  for (const key of STRING_KEYS) {
    const value = readString(source, key);
    if (value !== undefined) out[key] = value;
  }
  for (const key of NUMBER_KEYS) {
    const value = readNumber(source, key);
    if (value !== undefined) out[key] = value;
  }
  for (const key of BOOLEAN_KEYS) {
    const value = readBoolean(source, key);
    if (value !== undefined) out[key] = value;
  }

  if (typeof out.sport !== 'string') {
    throw new RangeError('Series template requires a sport');
  }
  if (typeof out.entityType !== 'string') {
    throw new RangeError('Series template requires an entityType');
  }
  if (typeof out.maxParticipants !== 'number') {
    throw new RangeError('Series template requires maxParticipants');
  }
  if (typeof out.isPublic !== 'boolean') out.isPublic = true;

  return out as unknown as GameSeriesTemplate;
}

/** Re-read a stored template, dropping anything that no longer type-checks. */
export function parseGameSeriesTemplate(raw: unknown): GameSeriesTemplate | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as TemplateSourceRecord;
  const anchor = source.anchorDayKey;
  if (!isDayKey(anchor)) return null;
  try {
    return buildGameSeriesTemplate(source, anchor);
  } catch {
    return null;
  }
}

/**
 * Merge an organizer edit into a stored template. Only the allow-listed keys
 * present in `patch` change; everything else survives untouched.
 */
export function mergeGameSeriesTemplate(
  template: GameSeriesTemplate,
  patch: TemplateSourceRecord,
): GameSeriesTemplate {
  const merged: TemplateSourceRecord = { ...(template as unknown as TemplateSourceRecord) };

  for (const key of STRING_KEYS) {
    if (!(key in patch)) continue;
    const value = readString(patch, key);
    if (value !== undefined) merged[key] = value;
  }
  for (const key of NUMBER_KEYS) {
    if (!(key in patch)) continue;
    const value = readNumber(patch, key);
    if (value !== undefined) merged[key] = value;
  }
  for (const key of BOOLEAN_KEYS) {
    if (!(key in patch)) continue;
    const value = readBoolean(patch, key);
    if (value !== undefined) merged[key] = value;
  }

  return buildGameSeriesTemplate(merged, template.anchorDayKey);
}

export function withAnchorDayKey(
  template: GameSeriesTemplate,
  anchorDayKey: DayKey,
): GameSeriesTemplate {
  if (!isDayKey(anchorDayKey)) {
    throw new RangeError(`Invalid anchor day key: ${anchorDayKey}`);
  }
  return { ...template, anchorDayKey };
}

/**
 * The create-game payload for one occurrence. `startTime` / `endTime` are
 * the already-resolved UTC instants; `cityId` comes from the club (or the
 * seeding game) so `GameCreateService` never has to guess.
 */
export interface OccurrenceCreatePayloadInput {
  template: GameSeriesTemplate;
  startTime: Date;
  endTime: Date;
  clubId: string | null;
  courtIds: readonly string[];
  cityId: string | null;
  ownerParticipates: boolean;
  ownerUserId: string;
}

export function buildOccurrenceCreatePayload({
  template,
  startTime,
  endTime,
  clubId,
  courtIds,
  cityId,
  ownerParticipates,
  ownerUserId,
}: OccurrenceCreatePayloadInput): Record<string, unknown> {
  // `anchorDayKey` is series bookkeeping, not part of the create-game payload.
  const payload: Record<string, unknown> = { ...template };
  delete payload.anchorDayKey;

  payload.startTime = startTime.toISOString();
  payload.endTime = endTime.toISOString();
  payload.timeIsSet = true;
  payload.clubId = clubId ?? undefined;
  payload.cityId = cityId ?? undefined;
  payload.courtIds = courtIds.length > 0 ? [...courtIds] : undefined;
  payload.courtId = courtIds.length > 0 ? courtIds[0] : undefined;
  // Generated occurrences are never auto-booked (PRD 345, Out of Scope). The
  // allow-list above already drops every booking key, so the deletes are belt
  // and braces for a hand-built template — but they are what guarantees the
  // generator can never hand `GameCreateService` a payload that links (or, via
  // a future provider integration, buys) a real court reservation. An organizer
  // books each occurrence themselves.
  for (const key of BOOKING_KEYS) delete payload[key];
  payload.hasBookedCourt = false;
  // A scheduler pass must never be blocked by the organizer's own calendar.
  payload.confirmOverlap = true;
  payload.participants = ownerParticipates ? [ownerUserId] : [];

  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }

  return payload;
}

export function templateStartTimeIsValid(startTimeLocal: string): boolean {
  return isLocalTimeString(startTimeLocal);
}

export type { GameSeriesCadenceValue };
