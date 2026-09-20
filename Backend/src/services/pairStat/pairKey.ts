/**
 * PRD 352 — the `PairStat` ordering invariant.
 *
 * `PairStat` has `@@unique([sport, cityId, userAId, userBId])` and **no** database
 * constraint that keeps `userAId < userBId`. Writing the mirrored row would create a
 * second aggregate for the same two people, so every read and every write of a pair
 * must go through {@link orderPairIds} first.
 *
 * Ordering is plain lexicographic on the cuid strings (`<`), not locale-aware
 * collation — cuids are ASCII, and `localeCompare` would make the invariant depend on
 * the process locale.
 */

export interface PairIds {
  userAId: string;
  userBId: string;
}

/** Separator used by the `?pair=a,b` overlay and by the pair detail route param. */
export const PAIR_PARAM_SEPARATOR = ',';

/** Separator used by in-memory pair maps. Never appears in a cuid. */
const PAIR_KEY_SEPARATOR = '|';

/**
 * Normalize two user ids to the stored `userAId < userBId` order.
 *
 * @throws never — callers that can receive the same id twice must use
 * {@link tryOrderPairIds} instead.
 */
export function orderPairIds(first: string, second: string): PairIds {
  return first < second
    ? { userAId: first, userBId: second }
    : { userAId: second, userBId: first };
}

/** Same as {@link orderPairIds} but rejects empty ids and self-pairs. */
export function tryOrderPairIds(
  first: string | null | undefined,
  second: string | null | undefined,
): PairIds | null {
  const a = typeof first === 'string' ? first.trim() : '';
  const b = typeof second === 'string' ? second.trim() : '';
  if (!a || !b || a === b) return null;
  return orderPairIds(a, b);
}

/** Stable in-memory map key for a pair, always in invariant order. */
export function pairKey(first: string, second: string): string {
  const { userAId, userBId } = orderPairIds(first, second);
  return `${userAId}${PAIR_KEY_SEPARATOR}${userBId}`;
}

/** Inverse of {@link pairKey}. */
export function splitPairKey(key: string): PairIds | null {
  const parts = key.split(PAIR_KEY_SEPARATOR);
  if (parts.length !== 2) return null;
  return tryOrderPairIds(parts[0], parts[1]);
}

/** Parse the `?pair=a,b` overlay value / `:pairId` route param. */
export function parsePairParam(raw: unknown): PairIds | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.split(PAIR_PARAM_SEPARATOR);
  if (parts.length !== 2) return null;
  return tryOrderPairIds(parts[0], parts[1]);
}

/** Build the `?pair=` overlay value, always in invariant order. */
export function formatPairParam(first: string, second: string): string {
  const { userAId, userBId } = orderPairIds(first, second);
  return `${userAId}${PAIR_PARAM_SEPARATOR}${userBId}`;
}

/**
 * Every unordered 2-combination of the given ids, deduped and in invariant order.
 * Duplicated ids in the input (a user listed twice on one team) never produce a
 * self-pair.
 */
export function pairCombinations(userIds: readonly string[]): PairIds[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of userIds) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }

  const out: PairIds[] = [];
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      out.push(orderPairIds(unique[i]!, unique[j]!));
    }
  }
  return out;
}
