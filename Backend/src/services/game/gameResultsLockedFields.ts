import { Prisma } from '@prisma/client';

/**
 * Game settings frozen once results entry has begun (or the game is archived).
 *
 * Deliberately excludes the results machinery (`status`, `resultsStatus`,
 * `resultsMeta`, `finishedDate`, readiness flags), the format-wizard keys in
 * `GAME_FORMAT_UPDATE_KEYS`, media/chat fields, and league wiring (`parentId`,
 * `leagueRoundId`, `leagueGroupId`, `metadata`) so live scoring, undo, and league
 * generation keep working after results start.
 */
export const GAME_RESULTS_LOCKED_FIELDS = [
  'name',
  'description',
  'clubId',
  'courtId',
  'cityId',
  'startTime',
  'endTime',
  'timeIsSet',
  'timeOverride',
  'maxParticipants',
  'minParticipants',
  'minLevel',
  'maxLevel',
  'isPublic',
  'anyoneCanInvite',
  'resultsByAnyone',
  'allowDirectJoin',
  'hasBookedCourt',
  'afterGameGoToBar',
  'trainerId',
  'priceTotal',
  'priceType',
  'priceCurrency',
  'eventKind',
  'venueText',
  'externalUrl',
] as const;

export type GameResultsLockedField = (typeof GAME_RESULTS_LOCKED_FIELDS)[number];

export const GAME_RESULTS_LOCKED_FIELDS_SELECT = Object.fromEntries(
  GAME_RESULTS_LOCKED_FIELDS.map((key) => [key, true]),
) as Record<GameResultsLockedField, true>;

function normalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return String(value.getTime());
  if (value instanceof Prisma.Decimal) return value.toString();
  if (typeof value === 'string') {
    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime()) && /\d{4}-\d{2}-\d{2}/.test(value)) {
      return String(asDate.getTime());
    }
    return value;
  }
  return String(value);
}

/**
 * Locked fields the patch would actually change. Sending a locked field with its
 * stored value is a no-op, not a violation — clients echo unchanged fields back.
 */
export function findLockedFieldChanges(
  current: Partial<Record<GameResultsLockedField, unknown>>,
  patch: Record<string, unknown>,
): GameResultsLockedField[] {
  return GAME_RESULTS_LOCKED_FIELDS.filter((key) => {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) return false;
    if (patch[key] === undefined) return false;
    return normalize(patch[key]) !== normalize(current[key]);
  });
}
