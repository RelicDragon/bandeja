/**
 * PRD 352 — ranking rules for the pair leaderboard. Pure, no Prisma.
 *
 * Period windows mirror `controllers/ranking.controller.ts`'s `timePeriod` exactly
 * (`10` / `30` days of `Game.startTime`, or `all`), so the Pairs tab and the Players
 * tab always mean the same thing by "last 30 days".
 */

import { winRatePercent } from './chemistry';
import { pairKey, type PairIds } from './pairKey';

/** Minimum games together inside the period before a pair is ranked at all. */
export const PAIR_MIN_GAMES = 5;

/** Minimum games together before a partner shows on Profile → Statistics. */
export const PARTNER_MIN_GAMES = 3;

export const PAIR_PERIODS = ['10', '30', 'all'] as const;
export type PairPeriod = (typeof PAIR_PERIODS)[number];

export const PAIR_SORTS = ['winRate', 'games', 'level'] as const;
export type PairSort = (typeof PAIR_SORTS)[number];

export const DEFAULT_PAIR_PERIOD: PairPeriod = 'all';
export const DEFAULT_PAIR_SORT: PairSort = 'winRate';

const DAY_MS = 24 * 60 * 60 * 1000;

export function parsePairPeriod(raw: unknown): PairPeriod {
  if (typeof raw !== 'string') return DEFAULT_PAIR_PERIOD;
  const trimmed = raw.trim();
  return (PAIR_PERIODS as readonly string[]).includes(trimmed)
    ? (trimmed as PairPeriod)
    : DEFAULT_PAIR_PERIOD;
}

export function parsePairSort(raw: unknown): PairSort {
  if (typeof raw !== 'string') return DEFAULT_PAIR_SORT;
  const trimmed = raw.trim();
  return (PAIR_SORTS as readonly string[]).includes(trimmed)
    ? (trimmed as PairSort)
    : DEFAULT_PAIR_SORT;
}

/** Inclusive lower bound of the period window, or `null` for all time. */
export function pairPeriodSince(period: PairPeriod, now: Date = new Date()): Date | null {
  if (period === 'all') return null;
  const days = period === '10' ? 10 : 30;
  return new Date(now.getTime() - days * DAY_MS);
}

export function qualifiesForPairRank(games: number): boolean {
  return Number.isFinite(games) && games >= PAIR_MIN_GAMES;
}

export interface PairRankCandidate extends PairIds {
  games: number;
  wins: number;
  /** Mean `UserSportProfile.level` of the two, or `null` when neither has a profile. */
  combinedLevel: number | null;
  lastPlayedAt: Date | null;
}

export interface OrderedPairCandidate extends PairRankCandidate {
  key: string;
  /** 0–100, or `0` when `games` is 0 (a candidate with 0 games never ranks). */
  winRate: number;
}

export function toOrderedPairCandidate(candidate: PairRankCandidate): OrderedPairCandidate {
  return {
    ...candidate,
    key: pairKey(candidate.userAId, candidate.userBId),
    winRate: winRatePercent(candidate.wins, candidate.games) ?? 0,
  };
}

function compareNullableDesc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function compareLastPlayedDesc(a: Date | null, b: Date | null): number {
  return compareNullableDesc(a ? a.getTime() : null, b ? b.getTime() : null);
}

/**
 * Deterministic comparator per sort mode. Every chain ends on the pair key so the
 * order — and therefore the cursor offsets — never depends on query plan order.
 */
export function comparePairCandidates(
  sort: PairSort,
): (a: OrderedPairCandidate, b: OrderedPairCandidate) => number {
  return (a, b) => {
    if (sort === 'games') {
      if (a.games !== b.games) return b.games - a.games;
      if (a.winRate !== b.winRate) return b.winRate - a.winRate;
    } else if (sort === 'level') {
      const byLevel = compareNullableDesc(a.combinedLevel, b.combinedLevel);
      if (byLevel !== 0) return byLevel;
      if (a.winRate !== b.winRate) return b.winRate - a.winRate;
      if (a.games !== b.games) return b.games - a.games;
    } else {
      if (a.winRate !== b.winRate) return b.winRate - a.winRate;
      if (a.games !== b.games) return b.games - a.games;
    }
    const byRecency = compareLastPlayedDesc(a.lastPlayedAt, b.lastPlayedAt);
    if (byRecency !== 0) return byRecency;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  };
}

/** Apply the games floor, then order. Input is never mutated. */
export function orderPairCandidates(
  candidates: readonly PairRankCandidate[],
  sort: PairSort,
): OrderedPairCandidate[] {
  return candidates
    .filter((candidate) => qualifiesForPairRank(candidate.games))
    .map(toOrderedPairCandidate)
    .sort(comparePairCandidates(sort));
}

/**
 * Ranks are **positional** (1..N over the ordered list), not competition ranks.
 *
 * `comparePairCandidates` is a total order — every chain ends on the pair key —
 * so two pairs never genuinely tie, and a positional rank is the only one that
 * stays consistent with the SQL `ROW_NUMBER()` the materialized path uses and
 * with the cursor offsets. `rank = offset + indexOnPage + 1`.
 */

/** Mean of the two players' sport levels; `null` when neither has one. */
export function combinedLevelOf(
  levelA: number | null | undefined,
  levelB: number | null | undefined,
): number | null {
  const values = [levelA, levelB].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
