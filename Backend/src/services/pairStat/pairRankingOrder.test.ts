/**
 * PRD 352 — ranking rules: the 5-game floor, the three sorts, the period
 * windows and the opaque cursor.
 */

import {
  DEFAULT_PAIR_PERIOD,
  DEFAULT_PAIR_SORT,
  PAIR_MIN_GAMES,
  PARTNER_MIN_GAMES,
  combinedLevelOf,
  orderPairCandidates,
  pairPeriodSince,
  parsePairPeriod,
  parsePairSort,
  qualifiesForPairRank,
  type PairRankCandidate,
} from './pairRankingOrder';
import { decodePairCursor, encodePairCursor, pairCursorFingerprint } from './pairCursor';
import { pairKey } from './pairKey';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const A = 'user-aaaa';
const B = 'user-bbbb';
const C = 'user-cccc';
const D = 'user-dddd';
const E = 'user-eeee';
const F = 'user-ffff';

function candidate(
  userAId: string,
  userBId: string,
  games: number,
  wins: number,
  combinedLevel: number | null = null,
  lastPlayedAt: Date | null = null,
): PairRankCandidate {
  return { userAId, userBId, games, wins, combinedLevel, lastPlayedAt };
}

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

{
  assert(parsePairPeriod('10') === '10', 'period 10 parses');
  assert(parsePairPeriod('30') === '30', 'period 30 parses');
  assert(parsePairPeriod('all') === 'all', 'period all parses');
  assert(parsePairPeriod(' 30 ') === '30', 'period is trimmed');
  assert(parsePairPeriod('90') === DEFAULT_PAIR_PERIOD, 'an unknown period falls back');
  assert(parsePairPeriod(undefined) === DEFAULT_PAIR_PERIOD, 'a missing period falls back');

  assert(parsePairSort('games') === 'games', 'sort games parses');
  assert(parsePairSort('level') === 'level', 'sort level parses');
  assert(parsePairSort('winRate') === 'winRate', 'sort winRate parses');
  assert(parsePairSort('elo') === DEFAULT_PAIR_SORT, 'an unknown sort falls back to win rate');
  assert(DEFAULT_PAIR_SORT === 'winRate', 'win rate is the default sort');
}

// ---------------------------------------------------------------------------
// Period windows — must match the player leaderboard's day maths exactly
// ---------------------------------------------------------------------------

{
  const now = new Date('2026-03-31T12:00:00.000Z');
  assert(pairPeriodSince('all', now) === null, 'all time has no lower bound');

  const ten = pairPeriodSince('10', now)!;
  assert(ten.toISOString() === '2026-03-21T12:00:00.000Z', '10-day window is exactly 10×24 h');

  const thirty = pairPeriodSince('30', now)!;
  assert(thirty.toISOString() === '2026-03-01T12:00:00.000Z', '30-day window is exactly 30×24 h');
  assert(thirty.getTime() < ten.getTime(), 'the 30-day window contains the 10-day one');
}

// ---------------------------------------------------------------------------
// The floor
// ---------------------------------------------------------------------------

{
  assert(PAIR_MIN_GAMES === 5, 'the leaderboard floor is 5 games together');
  assert(PARTNER_MIN_GAMES === 3, 'the profile partners floor is 3 games together');
  assert(!qualifiesForPairRank(4), '4 games does not rank');
  assert(qualifiesForPairRank(5), '5 games ranks');

  const ordered = orderPairCandidates(
    [candidate(A, B, 4, 4), candidate(C, D, 5, 1), candidate(E, F, 40, 0)],
    'winRate',
  );
  assert(ordered.length === 2, 'the 4-game pair is filtered out despite a perfect record');
  assert(ordered[0]!.key === pairKey(C, D), 'the 5-game 20 % pair outranks the 0 % pair');
}

// ---------------------------------------------------------------------------
// Sorts
// ---------------------------------------------------------------------------

{
  const pool = [
    candidate(A, B, 10, 9, 3.0), // 90 %
    candidate(C, D, 30, 21, 5.5), // 70 %
    candidate(E, F, 12, 6, 4.2), // 50 %
  ];

  const byWinRate = orderPairCandidates(pool, 'winRate').map((c) => c.key);
  assert(byWinRate[0] === pairKey(A, B), 'win rate sorts the 90 % pair first');
  assert(byWinRate[2] === pairKey(E, F), 'win rate sorts the 50 % pair last');

  const byGames = orderPairCandidates(pool, 'games').map((c) => c.key);
  assert(byGames[0] === pairKey(C, D), 'games sorts the 30-game pair first');
  assert(byGames[1] === pairKey(E, F), 'games sorts 12 before 10');

  const byLevel = orderPairCandidates(pool, 'level').map((c) => c.key);
  assert(byLevel[0] === pairKey(C, D), 'level sorts the 5.5 pair first');
  assert(byLevel[2] === pairKey(A, B), 'level sorts the 3.0 pair last');
}

{
  // A pair with no level at all sorts after every pair that has one, instead of
  // being treated as level 0 and polluting the middle of the table.
  const ordered = orderPairCandidates(
    [candidate(A, B, 6, 3, null), candidate(C, D, 6, 3, 1.0)],
    'level',
  );
  assert(ordered[0]!.key === pairKey(C, D), 'a known level outranks an unknown one');
}

{
  // Total order: identical numbers fall back to recency, then to the pair key,
  // so the same query always produces the same page at the same offset.
  const older = new Date('2026-01-01T00:00:00.000Z');
  const newer = new Date('2026-02-01T00:00:00.000Z');
  const ordered = orderPairCandidates(
    [candidate(C, D, 6, 3, 2, older), candidate(A, B, 6, 3, 2, newer)],
    'winRate',
  );
  assert(ordered[0]!.key === pairKey(A, B), 'ties break on the most recent game');

  const sameDay = orderPairCandidates(
    [candidate(C, D, 6, 3, 2, newer), candidate(A, B, 6, 3, 2, newer)],
    'winRate',
  );
  assert(sameDay[0]!.key === pairKey(A, B), 'a full tie breaks deterministically on the pair key');
}

{
  const winRates = orderPairCandidates([candidate(A, B, 8, 2)], 'winRate');
  assert(winRates[0]!.winRate === 25, 'the ordered candidate carries its win rate');
}

// ---------------------------------------------------------------------------
// Combined level
// ---------------------------------------------------------------------------

{
  assert(combinedLevelOf(3, 5) === 4, 'combined level is the mean');
  assert(combinedLevelOf(3, null) === 3, 'one known level is used alone');
  assert(combinedLevelOf(null, null) === null, 'two unknown levels stay unknown');
  assert(combinedLevelOf(undefined, 4) === 4, 'undefined behaves like null');
  assert(combinedLevelOf(Number.NaN, 4) === 4, 'NaN is not a level');
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

{
  const fingerprint = pairCursorFingerprint({
    cityId: 'city-1',
    sport: 'PADEL',
    period: 'all',
    sort: 'winRate',
  });
  assert(fingerprint === 'city-1:PADEL:all:winRate', 'the fingerprint covers every filter');

  const cursor = encodePairCursor({ offset: 40, fingerprint });
  assert(!cursor.includes('{'), 'the cursor is opaque, not readable JSON');
  const decoded = decodePairCursor(cursor)!;
  assert(decoded.offset === 40, 'the cursor round-trips its offset');
  assert(decoded.fingerprint === 'city-1:PADEL:all:winRate', 'the cursor round-trips its filters');

  assert(decodePairCursor('not-a-cursor') === null, 'garbage decodes to null');
  assert(
    decodePairCursor(Buffer.from('[-1,"x"]', 'utf8').toString('base64url')) === null,
    'a negative offset is rejected',
  );
  assert(
    decodePairCursor(Buffer.from('{"offset":1}', 'utf8').toString('base64url')) === null,
    'an object-shaped cursor is rejected',
  );
}

console.log('pairRankingOrder.test.ts OK');
